import { parseReportFilters, ReportFilters } from '../reports/report-filters';
import { ADMIN_ROLES, STAFF_ROLES, careDepartmentsFor, rolesFor } from '@cms/access';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { ExpenseDto, AppointmentDto, CareDto, InvoiceDto, LabDto, MovementDto, PaymentDto, PrescriptionDto, StaffDto, StockDto } from './operations.dto';

const ADMINS = ADMIN_ROLES;
export const ACCESS: Record<string, string[]> = Object.fromEntries(
  ['care', 'labs', 'stock', 'movements', 'prescriptions', 'invoices', 'appointments', 'expenses', 'staff', 'reports', 'audit'].map(area => [area, rolesFor(area + '.read')]),
);
const patient = { select: { patientNumber: true, firstName: true, lastName: true } };
const visit = { include: { patient } };
@Injectable()
export class OperationsService {
  constructor(private readonly db: PrismaService) {}
  allow(user: AuthenticatedUser, area: string, roles = ACCESS[area]) {
    if (!ADMINS.includes(user.role) && !roles?.includes(user.role)) throw new ForbiddenException('Your role cannot perform this action.');
  }
  async transaction<T>(user: AuthenticatedUser, action: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.db.$transaction(async tx => {
        const result = await work(tx);
        await tx.auditLog.create({ data: { userId: user.sub, action, entityType: action.split('_')[0], entityId: (result as { id?: string }).id ?? user.sub } });
        return result;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new ConflictException('A record with this reference already exists.');
        if (error.code === 'P2003' || error.code === 'P2025') throw new NotFoundException('The referenced record was not found.');
        if (error.code === 'P2034') throw new ConflictException('Another user changed this record. Refresh and try again.');
      }
      throw error;
    }
  }
  async openVisit(tx: Prisma.TransactionClient, id: string) {
    const record = await tx.visit.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Visit was not found.');
    if (['DISCHARGED','CANCELLED'].includes(record.status)) throw new BadRequestException('This visit is closed.');
    return record;
  }
  async list(area: string, user: AuthenticatedUser) {
    this.allow(user, area);
    const orderBy = { createdAt: 'desc' as const };
    switch (area) {
      case 'care': return this.db.careEntry.findMany({ where: { department: { in: careDepartmentsFor(user.role) } }, include: { visit }, orderBy, take: 200 });
      case 'labs': return this.db.labOrder.findMany({ include: { visit }, orderBy, take: 200 });
      case 'stock': return this.db.stockItem.findMany({ orderBy: { name: 'asc' }, take: 500 });
      case 'movements': return this.db.stockMovement.findMany({ include: { stockItem:true }, orderBy, take:200 });
      case 'prescriptions': return this.db.prescription.findMany({ include: { visit, stockItem: true }, orderBy, take: 200 });
      case 'invoices': return this.db.invoice.findMany({ include: { visit, payments: true }, orderBy, take: 200 });
      case 'appointments': return this.db.appointment.findMany({ include: { patient }, orderBy: { scheduledAt: 'desc' }, take: 200 });
      case 'expenses': return this.db.expense.findMany({ orderBy, take:200 });
      case 'staff': return this.db.user.findMany({ select: { id:true, email:true, firstName:true, lastName:true, role:true, active:true }, orderBy: { firstName: 'asc' } });
      case 'audit': return this.db.auditLog.findMany({ include: { user: { select: { firstName:true, lastName:true } } }, orderBy, take: 200 });
      default: throw new NotFoundException('Unknown module.');
    }
  }
  care(data: CareDto, user: AuthenticatedUser) {
    this.allow(user, 'care', rolesFor('care.' + data.department.toLowerCase()));
    if (!data.summary.trim()) throw new BadRequestException('Summary is required.');
    if (Object.keys(data.details).length > 30 || JSON.stringify(data.details).length > 12000 || Object.values(data.details).some(v => typeof v !== 'string' && typeof v !== 'number')) throw new BadRequestException('Invalid care details.');
    const fields: Record<string,string[]> = { TRIAGE:['temperature','systolic','diastolic','pulse','weight','oxygen'], CLINICAL:['diagnosis','plan'], RECOVERY:['observation'], CATERING:['diet','restrictions'] };
    if (Object.keys(data.details).some(key => !fields[data.department].includes(key))) throw new BadRequestException('Unknown care detail.');
    const ranges: Record<string,[number,number]> = { temperature:[25,45],systolic:[30,300],diastolic:[10,200],pulse:[10,300],weight:[0.1,700],oxygen:[1,100] };
    for (const [key,value] of Object.entries(data.details)) {
      if (data.department === 'TRIAGE' && (typeof value !== 'number' || !Number.isFinite(value) || value < ranges[key][0] || value > ranges[key][1])) throw new BadRequestException('Vital signs are outside the supported input range.');
      if (data.department !== 'TRIAGE' && typeof value !== 'string') throw new BadRequestException('Care details must be text.');
    }
    return this.transaction(user, 'CARE_RECORDED', async tx => { await this.openVisit(tx, data.visitId); return tx.careEntry.create({ data: { ...data, summary:data.summary.trim(), details: data.details as Prisma.InputJsonObject, recordedBy: user.sub } }); });
  }
  lab(data: LabDto, user: AuthenticatedUser) {
    this.allow(user, 'labs', rolesFor('labs.create'));
    return this.transaction(user, 'LAB_REQUESTED', async tx => { await this.openVisit(tx, data.visitId); return tx.labOrder.create({ data: { ...data, requestedBy: user.sub } }); });
  }
  result(id: string, result: string, user: AuthenticatedUser) {
    this.allow(user, 'labs', rolesFor('labs.result'));
    return this.transaction(user, 'LAB_RESULTED', async tx => {
      const order = await tx.labOrder.findUnique({ where: { id } });
      if (!order) throw new NotFoundException('Lab order was not found.');
      if (order.status !== 'REQUESTED') throw new ConflictException('This order already has a final result.');
      return tx.labOrder.update({ where: { id }, data: { result, status:'RESULTED', resultedBy:user.sub, resultedAt:new Date() } });
    });
  }
  stock(data: StockDto, user: AuthenticatedUser) {
    this.allow(user, 'stock', rolesFor('stock.create'));
    if (new Date(data.expiresAt) <= new Date()) throw new BadRequestException('New stock must have a future expiry date.');
    return this.transaction(user, 'STOCK_CREATED', tx => tx.stockItem.create({ data: { ...data, expiresAt:new Date(data.expiresAt), movements: { create: { quantity:data.quantity, reason:'Opening balance', recordedBy:user.sub } } } }));
  }
  movement(id: string, data: MovementDto, user: AuthenticatedUser) {
    this.allow(user, 'stock', rolesFor('stock.create'));
    if (!data.quantity) throw new BadRequestException('Quantity must not be zero.');
    return this.transaction(user, 'STOCK_ADJUSTED', async tx => {
      const item = await tx.stockItem.findUnique({ where: { id } });
      if (!item) throw new NotFoundException('Stock item was not found.');
      if (item.quantity + data.quantity < 0) throw new BadRequestException('Insufficient stock.');
      await tx.stockItem.update({ where: { id }, data: { quantity: { increment:data.quantity } } });
      return tx.stockMovement.create({ data: { stockItemId:id, ...data, recordedBy:user.sub } });
    });
  }
  prescribe(data: PrescriptionDto, user: AuthenticatedUser) {
    this.allow(user, 'prescriptions', rolesFor('prescriptions.create'));
    return this.transaction(user, 'PRESCRIPTION_CREATED', async tx => { await this.openVisit(tx, data.visitId); return tx.prescription.create({ data: { ...data, prescribedBy:user.sub } }); });
  }
  dispense(id: string, user: AuthenticatedUser) {
    this.allow(user, 'prescriptions', rolesFor('prescriptions.dispense'));
    return this.transaction(user, 'PRESCRIPTION_DISPENSED', async tx => {
      const rx = await tx.prescription.findUnique({ where: { id }, include: { stockItem:true } });
      if (!rx) throw new NotFoundException('Prescription was not found.');
      if (rx.dispensedAt) throw new ConflictException('Prescription already dispensed.');
      await this.openVisit(tx, rx.visitId);
      if (rx.stockItem.expiresAt <= new Date() || rx.stockItem.quantity < rx.quantity) throw new BadRequestException('Stock is expired or insufficient.');
      await tx.stockItem.update({ where: { id:rx.stockItemId }, data: { quantity: { decrement:rx.quantity } } });
      await tx.stockMovement.create({ data: { stockItemId:rx.stockItemId, quantity:-rx.quantity, reason:`Prescription ${id}`, recordedBy:user.sub } });
      return tx.prescription.update({ where: { id }, data: { dispensedAt:new Date(), dispensedBy:user.sub } });
    });
  }
  invoice(data: InvoiceDto, user: AuthenticatedUser) {
    this.allow(user, 'invoices', rolesFor('invoices.create'));
    return this.transaction(user, 'INVOICE_CREATED', async tx => { await this.openVisit(tx, data.visitId); return tx.invoice.create({ data: { ...data, createdBy:user.sub } }); });
  }
  payment(id: string, data: PaymentDto, user: AuthenticatedUser) {
    this.allow(user, 'invoices', rolesFor('invoices.payment'));
    return this.transaction(user, 'PAYMENT_RECORDED', async tx => {
      const invoice = await tx.invoice.findUnique({ where: { id }, include: { payments:true } });
      if (!invoice) throw new NotFoundException('Invoice was not found.');
      const paid = invoice.payments.reduce((sum,p) => sum+p.amountCents,0);
      if (paid + data.amountCents > invoice.amountCents) throw new BadRequestException('Payment exceeds outstanding balance.');
      return tx.payment.create({ data: { ...data, reference:data.reference.trim(), invoiceId:id, recordedBy:user.sub } });
    });
  }
  appointment(data: AppointmentDto, user: AuthenticatedUser) {
    this.allow(user,'appointments',rolesFor('appointments.create'));
    if (new Date(data.scheduledAt) <= new Date()) throw new BadRequestException('Appointment must be in the future.');
    return this.transaction(user,'APPOINTMENT_BOOKED',tx => tx.appointment.create({ data: { ...data, scheduledAt:new Date(data.scheduledAt), createdBy:user.sub } }));
  }
  appointmentStatus(id: string, status: string, user: AuthenticatedUser) {
    this.allow(user,'appointments',rolesFor('appointments.create'));
    return this.transaction(user,'APPOINTMENT_UPDATED',async tx => {
      const item = await tx.appointment.findUnique({ where: { id } });
      if (!item) throw new NotFoundException('Appointment was not found.');
      if (item.status !== 'BOOKED') throw new ConflictException('Appointment is already closed.');
      return tx.appointment.update({ where: { id }, data: { status } });
    });
  }
  async staff(data: StaffDto, user: AuthenticatedUser) {
    this.allow(user,'staff');
    if (Buffer.byteLength(data.password) > 72) throw new BadRequestException('Password must fit within 72 UTF-8 bytes.');
    if (data.role !== 'PATIENT' && data.patientId) throw new BadRequestException('Only patient accounts may link to a patient record.');
    if (data.role === 'CLINIC_ADMIN' && user.role !== 'SUPER_ADMIN') throw new ForbiddenException('Only a super administrator can assign clinic administrators.');
    const passwordHash = await hash(data.password,12);
    return this.transaction(user,'STAFF_CREATED',tx => tx.user.create({ data: { email:data.email.trim().toLowerCase(), firstName:data.firstName.trim(), lastName:data.lastName.trim(), role:data.role as UserRole, patientId:data.patientId, passwordHash }, select: { id:true, email:true, role:true } }));
  }
  updateRole(id: string, role: string, user: AuthenticatedUser) {
    this.allow(user,'staff',rolesFor('staff.update'));
    if (id === user.sub) throw new BadRequestException('You cannot change your own role.');
    if (!STAFF_ROLES.includes(role)) throw new BadRequestException('Choose a valid staff role.');
    return this.transaction(user,'STAFF_ROLE_CHANGED',async tx => {
      const target = await tx.user.findUnique({where:{id}});
      if (!target) throw new NotFoundException('Staff member was not found.');
      if (target.role === 'PATIENT' || target.role === 'SUPER_ADMIN') throw new ForbiddenException('This account role cannot be changed.');
      if (user.role !== 'SUPER_ADMIN' && (target.role === 'CLINIC_ADMIN' || role === 'CLINIC_ADMIN')) throw new ForbiddenException('Only a super administrator can assign or manage clinic administrators.');
      return tx.user.update({where:{id},data:{role:role as UserRole},select:{id:true,role:true}});
    });
  }
  deactivate(id: string, user: AuthenticatedUser) {
    this.allow(user,'staff');
    if (id === user.sub) throw new BadRequestException('You cannot deactivate your own account.');
    return this.transaction(user,'STAFF_DEACTIVATED',async tx => {
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw new NotFoundException('Staff member was not found.');
      if (target.role === 'SUPER_ADMIN' || (target.role === 'CLINIC_ADMIN' && user.role !== 'SUPER_ADMIN')) throw new ForbiddenException('Only a super administrator can manage clinic administrators.');
      return tx.user.update({ where: { id }, data: { active:false }, select: { id:true, active:true } });
    });
  }

  expense(data: ExpenseDto, user: AuthenticatedUser) {
    this.allow(user,'expenses');
    if (!data.description.trim() || !data.reference.trim()) throw new BadRequestException('Description and reference are required.');
    if (new Date(data.incurredAt) > new Date()) throw new BadRequestException('Expense date cannot be in the future.');
    return this.transaction(user,'EXPENSE_RECORDED',tx=>tx.expense.create({data:{...data,description:data.description.trim(),reference:data.reference.trim(),incurredAt:new Date(data.incurredAt),recordedBy:user.sub}}));
  }
  async portal(user: AuthenticatedUser) {
    if (user.role !== 'PATIENT') throw new ForbiddenException('Patient access is required.');
    const account = await this.db.user.findUnique({where:{id:user.sub},select:{patientId:true}});
    if (!account?.patientId) throw new NotFoundException('No patient record is linked to this account.');
    return this.db.patient.findUniqueOrThrow({where:{id:account.patientId},select:{
      patientNumber:true,firstName:true,lastName:true,allergies:true,medicalAlerts:true,
      appointments:{orderBy:{scheduledAt:'desc'},take:100,select:{id:true,scheduledAt:true,reason:true,status:true}},
      visits:{orderBy:{createdAt:'desc'},take:100,select:{id:true,visitNumber:true,status:true,reason:true,arrivedAt:true,
        labOrders:{where:{status:'RESULTED'},select:{id:true,testName:true,result:true,resultedAt:true}},
        prescriptions:{select:{id:true,instructions:true,quantity:true,dispensedAt:true,stockItem:{select:{name:true}}}},
        invoices:{select:{id:true,description:true,amountCents:true,payments:{select:{amountCents:true,method:true,reference:true}}}},
      }},
    }});
  }
  async reports(user: AuthenticatedUser, input: ReportFilters = {}) {
    this.allow(user,'reports');
    const { dateRange, status, department, method, filters } = parseReportFilters(input);
    const visitWhere = { arrivedAt: dateRange, status };
    const [patients, visits, invoices, payments, stock, labPending, appointments, departments, drugUsage, expenses, allInvoices, allPayments, served] = await this.db.$transaction([
      this.db.patient.count({where:{createdAt:dateRange}}),
      this.db.visit.groupBy({by:['status'],orderBy:{status:'asc'},where:visitWhere,_count:true}),
      this.db.invoice.aggregate({where:{createdAt:dateRange},_sum:{amountCents:true}}),
      this.db.payment.groupBy({by:['method'],orderBy:{method:'asc'},where:{createdAt:dateRange,method},_sum:{amountCents:true}}),
      this.db.stockItem.findMany({select:{id:true,name:true,batch:true,quantity:true,reorderLevel:true,expiresAt:true}}),
      this.db.labOrder.count({where:{status:'REQUESTED',createdAt:dateRange}}),
      this.db.appointment.count({where:{status:'BOOKED',scheduledAt:dateRange}}),
      this.db.careEntry.groupBy({by:['department'],orderBy:{department:'asc'},where:{createdAt:dateRange,department},_count:true}),
      this.db.prescription.groupBy({by:['stockItemId'],orderBy:{stockItemId:'asc'},where:{dispensedAt:dateRange ?? {not:null}},_sum:{quantity:true}}),
      this.db.expense.aggregate({where:{incurredAt:dateRange},_sum:{amountCents:true}}),
      this.db.invoice.aggregate({_sum:{amountCents:true}}),
      this.db.payment.aggregate({_sum:{amountCents:true}}),
      this.db.$queryRaw<{count:bigint}[]>(Prisma.sql`SELECT COUNT(DISTINCT "patientId") AS count FROM "Visit" WHERE TRUE
        ${dateRange?.gte ? Prisma.sql`AND "arrivedAt" >= ${dateRange.gte}` : Prisma.empty}
        ${dateRange?.lt ? Prisma.sql`AND "arrivedAt" < ${dateRange.lt}` : Prisma.empty}
        ${status ? Prisma.sql`AND "status" = ${status}::"VisitStatus"` : Prisma.empty}`),
    ], {isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
    const billedCents=invoices._sum.amountCents ?? 0;
    const collectedCents=payments.reduce((sum,p)=>sum+(p._sum?.amountCents ?? 0),0);
    return {
      filters,generatedAt:new Date().toISOString(),patients,patientsServed:Number(served[0]?.count ?? 0),visits,
      billedCents,collectedCents,expensesCents:expenses._sum.amountCents ?? 0,
      outstandingCents:(allInvoices._sum.amountCents ?? 0)-(allPayments._sum.amountCents ?? 0),
      departments,payments,labPending,appointments,
      drugUsage:drugUsage.map(d=>({...d,name:stock.find(s=>s.id===d.stockItemId)?.name ?? d.stockItemId})),
      stockAlerts:stock.filter(s=>s.quantity<=s.reorderLevel || s.expiresAt<=new Date(Date.now()+30*86400000)),
    };
  }
}
