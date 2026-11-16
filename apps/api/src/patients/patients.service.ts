import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(search?: string, pageValue?: string, pageSizeValue?: string) {
    const page = this.parsePositiveInteger(pageValue, 1, 'page');
    const pageSize = Math.min(this.parsePositiveInteger(pageSizeValue, 20, 'pageSize'), 100);
    const term = search?.trim();
    const where = term
      ? {
          OR: [
            { patientNumber: { contains: term, mode: 'insensitive' as const } },
            { firstName: { contains: term, mode: 'insensitive' as const } },
            { lastName: { contains: term, mode: 'insensitive' as const } },
            { phone: { contains: term } },
          ],
        }
      : {};

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
          gender: true,
          phone: true,
          createdAt: true,
        },
      }),
      this.prisma.patient.count({ where }),
    ]);

    return { items, page, pageSize, total };
  }

  async get(id: string) {
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
          },
        },
      },
    });
    if (!patient) throw new NotFoundException('Patient was not found.');
    return patient;
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
          patientNumber: `P-${randomUUID().slice(0, 8).toUpperCase()}`,
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

  private parsePositiveInteger(value: string | undefined, defaultValue: number, name: string): number {
    if (value === undefined) return defaultValue;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      throw new BadRequestException(`${name} must be a positive integer.`);
    }
    return parsed;
  }
}
