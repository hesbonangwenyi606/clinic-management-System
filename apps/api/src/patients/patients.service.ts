import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(search?: string, pageValue?: string, pageSizeValue?: string) {
    const page = this.parsePositiveInteger(pageValue, 1, 'page');
    const pageSize = Math.min(this.parsePositiveInteger(pageSizeValue, 20, 'pageSize'), 100);
    const term = search?.trim();
    const where = { archivedAt: null, ...(term
      ? {
          OR: [
            { patientNumber: { contains: term, mode: 'insensitive' as const } },
            { legacyPatientNumber: { equals: term, mode: 'insensitive' as const } },
            { firstName: { contains: term, mode: 'insensitive' as const } },
            { lastName: { contains: term, mode: 'insensitive' as const } },
            { phone: { contains: term } },
          ],
        }
      : {}) };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          patientNumber: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          age: true,
          gender: true,
          phone: true,
          createdAt: true,
        },
      }),
      this.prisma.patient.count({ where }),
    ]);

    return { items, page, pageSize, total };
  }

  async get(id: string, userId?: string, includePayments = false) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        visits: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            visitNumber: true,
            type: true,
            status: true,
            reason: true,
            arrivedAt: true,
            archivedAt: true,
          },
        },
      },
    });
    if (!patient) throw new NotFoundException('Patient was not found.');
    if(userId)await this.prisma.auditLog.create({data:{userId,action:'PATIENT_VIEWED',entityType:'Patient',entityId:id}});
    if (!includePayments || !patient.visits.length) return patient;

    const payments = await this.prisma.payment.findMany({
      where: { reversal: null, invoice: { visit: { patientId: id } } },
      select: { amountCents: true, invoice: { select: { visitId: true } } },
    });
    const paidByVisit = new Map<string, number>();
    for (const { amountCents, invoice: { visitId } } of payments) {
      paidByVisit.set(visitId, (paidByVisit.get(visitId) ?? 0) + amountCents);
    }
    return {
      ...patient,
      visits: patient.visits.map(visit => ({
        ...visit,
        amountPaidCents: paidByVisit.get(visit.id) ?? 0,
      })),
    };
  }

  async create(data: CreatePatientDto, userId: string) {
    if (!data.firstName.trim() || !data.lastName.trim()) throw new BadRequestException('Patient names cannot be blank.');
    if (data.dateOfBirth && new Date(data.dateOfBirth) > new Date()) throw new BadRequestException('Date of birth cannot be in the future.');
    return this.prisma.$transaction(async (transaction) => {
      const patient = await transaction.patient.create({
        data: {
          ...data,
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          email: data.email?.trim().toLowerCase(),
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        },
      });
      await transaction.auditLog.create({
        data: {
          userId,
          action: 'PATIENT_CREATED',
          entityType: 'Patient',
          entityId: patient.id,
        },
      });
      return patient;
    });
  }

  async update(id: string, data: Partial<CreatePatientDto> & {expectedUpdatedAt?:string}, userId: string) {
    if ((data.firstName !== undefined && !data.firstName?.trim()) || (data.lastName !== undefined && !data.lastName?.trim())) throw new BadRequestException('Patient names cannot be blank.');
    if (data.dateOfBirth && new Date(data.dateOfBirth) > new Date()) throw new BadRequestException('Date of birth cannot be in the future.');
    return this.prisma.$transaction(async tx => {
      const existing = await tx.patient.findUnique({where:{id}});
      if (!existing) throw new NotFoundException('Patient was not found.');
      if (existing.archivedAt) throw new BadRequestException('Archived patient records cannot be edited.');
      if(data.expectedUpdatedAt && existing.updatedAt.getTime()!==new Date(data.expectedUpdatedAt).getTime())throw new ConflictException('Patient details changed. Reload the record before saving.');
      const patch:Prisma.PatientUpdateInput={};
      if(data.firstName!==undefined)patch.firstName=data.firstName.trim();
      if(data.lastName!==undefined)patch.lastName=data.lastName.trim();
      if(data.gender!==undefined)patch.gender=data.gender;
      if(data.dateOfBirth!==undefined)patch.dateOfBirth=data.dateOfBirth?new Date(data.dateOfBirth):null;
      if (data.age !== undefined) patch.age = data.age;
      for(const field of ['phone','email','address','emergencyContact','nextOfKin','allergies','medicalAlerts'] as const) {
        if(data[field]!==undefined)patch[field]=data[field]?.trim()||null;
      }
      if(typeof patch.email==='string')patch.email=patch.email.toLowerCase();
      const patient = await tx.patient.update({where:{id},data:patch});
      await tx.auditLog.create({data:{userId,action:'PATIENT_UPDATED',entityType:'Patient',entityId:id}});
      return patient;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async remove(id: string, userId: string) {
    return this.prisma.$transaction(async tx => {
      const patient = await tx.patient.findUnique({where:{id},include:{_count:{select:{visits:true,appointments:true}},portalAccount:{select:{id:true}}}});
      if (!patient) throw new NotFoundException('Patient was not found.');
      const preserve = patient._count.visits > 0 || patient._count.appointments > 0 || !!patient.portalAccount;
      if (preserve) {
        await tx.patient.update({where:{id},data:{archivedAt:new Date()}});
        if (patient.portalAccount) await tx.user.update({where:{id:patient.portalAccount.id},data:{active:false,sessionVersion:{increment:1}}});
      } else await tx.patient.delete({where:{id}});
      await tx.auditLog.create({data:{userId,action:preserve?'PATIENT_ARCHIVED':'PATIENT_DELETED',entityType:'Patient',entityId:id}});
      return {deleted:!preserve,message:preserve?'Patient archived. Existing history is preserved and portal access is disabled.':'Patient deleted.'};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  private parsePositiveInteger(value: string | undefined, defaultValue: number, name: string): number {
    if (value === undefined) return defaultValue;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      throw new BadRequestException(`${name} must be a positive integer.`);
    }
    return parsed;
  }
}
