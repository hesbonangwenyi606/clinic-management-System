import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { VisitStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVisitDto } from './dto/create-visit.dto';
import { UpdateVisitStatusDto } from './dto/update-visit-status.dto';

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

  async list(statusValue?: string) {
    let status: VisitStatus | undefined;
    if (statusValue) {
      if (!Object.values(VisitStatus).includes(statusValue as VisitStatus)) {
        throw new BadRequestException('Unknown visit status.');
      }
      status = statusValue as VisitStatus;
    }
    return this.prisma.visit.findMany({
      where: status ? { status } : undefined,
      orderBy: { arrivedAt: 'desc' },
      take: 100,
      include: {
        patient: {
          select: { id: true, patientNumber: true, firstName: true, lastName: true, phone: true },
        },
      },
    });
  }

  async history(id: string) {
    const visit = await this.prisma.visit.findUnique({ where: { id }, select: { id:true } });
    if (!visit) throw new NotFoundException('Visit was not found.');
    return this.prisma.workflowEvent.findMany({ where: { visitId:id }, orderBy: { changedAt:'asc' }, include: { changedBy: { select: { firstName:true,lastName:true } } } });
  }

  async create(data: CreateVisitDto, userId: string) {
    if (!data.reason.trim()) throw new BadRequestException('Visit reason cannot be blank.');
    const patient = await this.prisma.patient.findUnique({ where: { id: data.patientId }, select: { id: true } });
    if (!patient) throw new NotFoundException('Patient was not found.');

    return this.prisma.$transaction(async (transaction) => {
      const visit = await transaction.visit.create({
        data: {
          visitNumber: `V-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 6).toUpperCase()}`,
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
    });
  }

  async updateStatus(id: string, data: UpdateVisitStatusDto, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const visit = await transaction.visit.findUnique({ where: { id } });
      if (!visit) throw new NotFoundException('Visit was not found.');
      if (!ALLOWED_TRANSITIONS[visit.status].includes(data.status)) {
        throw new BadRequestException(`Visit cannot move from ${visit.status} to ${data.status}.`);
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
