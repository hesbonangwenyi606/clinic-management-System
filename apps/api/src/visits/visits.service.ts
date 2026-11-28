import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole, VisitStatus } from '@prisma/client';
import { visitTransitionsFor, rolesFor } from '@cms/access';
import { ListQuery, pagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVisitDto } from './dto/create-visit.dto';
import { UpdateVisitStatusDto } from './dto/update-visit-status.dto';
import { UpdateVisitDto } from './dto/update-visit.dto';

const ALLOWED_TRANSITIONS: Record<VisitStatus, VisitStatus[]> = {
  REGISTERED: ['WAITING', 'IN_PROGRESS', 'ADMITTED', 'CANCELLED'],
  WAITING: ['IN_PROGRESS', 'REFERRED', 'ADMITTED', 'CANCELLED'],
  IN_PROGRESS: ['WAITING', 'REFERRED', 'ADMITTED', 'UNDER_OBSERVATION', 'COMPLETED', 'DISCHARGED'],
  REFERRED: ['WAITING', 'IN_PROGRESS', 'ADMITTED', 'CANCELLED'],
  ADMITTED: ['IN_PROGRESS', 'UNDER_OBSERVATION', 'COMPLETED', 'DISCHARGED'],
  UNDER_OBSERVATION: ['IN_PROGRESS', 'COMPLETED', 'DISCHARGED'],
  COMPLETED: ['DISCHARGED'],
  DISCHARGED: [],
  CANCELLED: [],
};

@Injectable()
export class VisitsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(statusValue?: string, role?: UserRole, query: ListQuery = {}) {
    const {skip,take,search} = pagination(query);
    let status: VisitStatus | undefined;
    if (statusValue) {
      if (statusValue !== 'OPEN' && !Object.values(VisitStatus).includes(statusValue as VisitStatus)) {
        throw new BadRequestException('Unknown visit status.');
      }
      if(statusValue !== 'OPEN') status = statusValue as VisitStatus;
    }
    return this.prisma.visit.findMany({
      where: {
        archivedAt: null,
        status: statusValue === 'OPEN' ? { notIn: ['COMPLETED', 'DISCHARGED', 'CANCELLED'] } : status,
        ...(search && { OR: [
          { visitNumber: { contains: search, mode: 'insensitive' } },
          { legacyVisitNumber: { equals: search, mode: 'insensitive' } },
          { patient: { OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { patientNumber: { contains: search, mode: 'insensitive' } },
          ] } },
        ] }),
      },
      orderBy: [{ arrivedAt: 'desc' },{id:'desc'}],
      skip, take,
      select: {
        id:true, visitNumber:true, type:true, status:true, arrivedAt:true,
        reason:!!role && rolesFor('patients.read').includes(role),
        patient: {
          select: { id: true, patientNumber: true, firstName: true, lastName: true, phone:!!role && rolesFor('patients.read').includes(role) },
        },
      },
    });
  }
  async summary() {
    const [active,waiting] = await this.prisma.$transaction([
      this.prisma.visit.count({where:{archivedAt:null,status:{notIn:['COMPLETED','DISCHARGED','CANCELLED']}}}),
      this.prisma.visit.count({where:{archivedAt:null,status:{in:['REGISTERED','WAITING']}}}),
    ],{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
    return {active,waiting};
  }

  async history(id: string) {
    const visit = await this.prisma.visit.findUnique({ where: { id }, select: { id:true } });
    if (!visit) throw new NotFoundException('Visit was not found.');
    return this.prisma.workflowEvent.findMany({ where: { visitId:id }, orderBy: { changedAt:'asc' }, include: { changedBy: { select: { firstName:true,lastName:true } } } });
  }

  async update(id: string, data: UpdateVisitDto, userId: string) {
    if (data.reason.trim().length < 2) throw new BadRequestException('Visit reason must contain at least two characters.');
    return this.prisma.$transaction(async tx => {
      const existing = await tx.visit.findUnique({where:{id},select:{id:true}});
      if (!existing) throw new NotFoundException('Visit was not found.');
      const visit = await tx.visit.update({where:{id},data:{type:data.type,reason:data.reason.trim()}});
      await tx.auditLog.create({data:{userId,action:'VISIT_UPDATED',entityType:'Visit',entityId:id}});
      return visit;
    });
  }

  async remove(id: string, userId: string) {
    return this.prisma.$transaction(async tx => {
      const visit = await tx.visit.findUnique({where:{id},select:{archivedAt:true,admission:{select:{id:true}},_count:{select:{careEntries:true,labOrders:true,invoices:true,prescriptions:true}}}});
      if (!visit) throw new NotFoundException('Visit was not found.');
      if (visit.archivedAt) return {deleted:false,archived:true};
      const counts = visit._count;
      if (visit.admission || counts.careEntries || counts.labOrders || counts.invoices || counts.prescriptions) {
        await tx.visit.update({where:{id},data:{archivedAt:new Date()}});
        await tx.auditLog.create({data:{userId,action:'VISIT_ARCHIVED',entityType:'Visit',entityId:id}});
        return {deleted:false,archived:true};
      }
      await tx.visit.delete({where:{id}});
      await tx.auditLog.create({data:{userId,action:'VISIT_DELETED',entityType:'Visit',entityId:id}});
      return {deleted:true};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async create(data: CreateVisitDto, userId: string) {
    if (!data.reason.trim()) throw new BadRequestException('Visit reason cannot be blank.');
    return this.prisma.$transaction(async (transaction) => {
      const patient = await transaction.patient.findUnique({ where: { id: data.patientId }, select: { id: true, archivedAt: true } });
      if (!patient) throw new NotFoundException('Patient was not found.');
      if (patient.archivedAt) throw new BadRequestException('Archived patients cannot open new visits.');
      const visit = await transaction.visit.create({
        data: {
          patientId: data.patientId,
          type: data.type,
          reason: data.reason.trim(),
          createdById: userId,
          workflowEvents: {
            create: {
              fromStatus: null,
              toStatus: VisitStatus.REGISTERED,
              note: 'Visit registered',
              changedById: userId,
            },
          },
        },
        include: {
          patient: { select: { patientNumber: true, firstName: true, lastName: true } },
        },
      });
      await transaction.auditLog.create({
        data: {
          userId,
          action: 'VISIT_CREATED',
          entityType: 'Visit',
          entityId: visit.id,
        },
      });
      return visit;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async updateStatus(id: string, data: UpdateVisitStatusDto, userId: string, role: UserRole) {
    return this.prisma.$transaction(async (transaction) => {
      const visit = await transaction.visit.findUnique({ where: { id } });
      if (!visit) throw new NotFoundException('Visit was not found.');
      if (!ALLOWED_TRANSITIONS[visit.status].includes(data.status)) {
        throw new BadRequestException(`Visit cannot move from ${visit.status} to ${data.status}.`);
      }
      if (!visitTransitionsFor(role,visit.status).includes(data.status)) throw new ForbiddenException('Your role cannot make this transition.');
      if(data.status==='ADMITTED')throw new BadRequestException('Use the admission form to assign a bed and clinician.');
      if(['COMPLETED','DISCHARGED'].includes(data.status)) {
        const admission=await transaction.admission.findUnique({where:{visitId:id}});
        if(admission && !admission.dischargedAt)throw new BadRequestException('Use the inpatient discharge form to release the bed and record a summary.');
      }

      const changed = await transaction.visit.updateMany({
        where: { id, status: visit.status }, data: { status: data.status },
      });
      if (changed.count !== 1) throw new ConflictException('Visit changed. Refresh and try again.');
      const updated = await transaction.visit.findUniqueOrThrow({ where: { id } });
      await transaction.workflowEvent.create({
        data: {
          visitId: id,
          fromStatus: visit.status,
          toStatus: data.status,
          note: data.note?.trim(),
          changedById: userId,
        },
      });
      await transaction.auditLog.create({
        data: {
          userId,
          action: 'VISIT_STATUS_CHANGED',
          entityType: 'Visit',
          entityId: id,
        },
      });
      return updated;
    });
  }
}
