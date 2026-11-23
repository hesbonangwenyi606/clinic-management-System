import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {ADMIN_ROLES,CLINICIAN_ROLES,canPerform,careDepartmentsFor,visitTransitionsFor} from '@cms/access';
import {PrismaService} from '../prisma/prisma.service';
import {OperationsService} from '../operations/operations.service';
import {AuthenticatedUser} from '../auth/auth.types';
import {ListQuery,pagination} from '../common/pagination';
import {AdmitDto,AmendmentDto,BedDto,DischargeDto,TransferDto} from './workflows.dto';

@Injectable()
export class WorkflowsService {
  constructor(private readonly db:PrismaService,private readonly operations:OperationsService) {}
  private clinical(user:AuthenticatedUser) {
    if(![...ADMIN_ROLES,...CLINICIAN_ROLES].includes(user.role))throw new ForbiddenException('Clinical authorization is required.');
  }
  beds() {return this.db.bed.findMany({where:{active:true},orderBy:[{ward:'asc'},{name:'asc'}],include:{admissions:{where:{dischargedAt:null},select:{id:true}}}});}
  clinicians() {return this.db.user.findMany({where:{active:true,role:{in:['SUPER_ADMIN','CLINIC_ADMIN','CLINICIAN_1','CLINICIAN_2','CLINICIAN_3']}},select:{id:true,firstName:true,lastName:true},orderBy:{firstName:'asc'}});}
  bed(data:BedDto,user:AuthenticatedUser) {
    if(!ADMIN_ROLES.includes(user.role))throw new ForbiddenException('Administrator access is required.');
    return this.operations.transaction(user,'BED_CREATED',tx=>tx.bed.create({data}));
  }
  admissions(query:ListQuery) {
    const {skip,take,search}=pagination(query);
    if(query.status && !['ACTIVE','DISCHARGED'].includes(query.status))throw new BadRequestException('Invalid admission status.');
    return this.db.admission.findMany({where:{dischargedAt:query.status==='DISCHARGED'?{not:null}:null,...(search?{visit:{patient:{OR:[{firstName:{contains:search,mode:'insensitive'}},{lastName:{contains:search,mode:'insensitive'}},{patientNumber:{contains:search,mode:'insensitive'}}]}}}:{})},include:{bed:true,clinician:{select:{firstName:true,lastName:true}},visit:{select:{id:true,visitNumber:true,status:true,patient:{select:{firstName:true,lastName:true,patientNumber:true}}}},events:{orderBy:{createdAt:'asc'}}},orderBy:[{admittedAt:'desc'},{id:'desc'}],skip,take});
  }
  private async availableBed(tx:Prisma.TransactionClient,id:string) {
    const bed=await tx.bed.findUnique({where:{id},include:{admissions:{where:{dischargedAt:null},select:{id:true}}}});
    if(!bed?.active)throw new NotFoundException('Bed is unavailable.');
    if(bed.admissions.length)throw new ConflictException('Bed is already occupied.');
    return bed;
  }
  admit(data:AdmitDto,user:AuthenticatedUser) {
    this.clinical(user);
    return this.operations.transaction(user,'ADMISSION_CREATED',async tx=>{
      const visit=await this.operations.openVisit(tx,data.visitId);
      if(!visitTransitionsFor(user.role,visit.status).includes('ADMITTED') && visit.status!=='ADMITTED')throw new BadRequestException('Visit cannot be admitted in its current state.');
      const patient=await tx.patient.findUnique({where:{id:visit.patientId},select:{archivedAt:true}});
      if(!patient || patient.archivedAt)throw new BadRequestException('Patient is archived.');
      if(await tx.admission.findFirst({where:{dischargedAt:null,visit:{patientId:visit.patientId}}}))throw new ConflictException('Patient already has an active admission.');
      await this.availableBed(tx,data.bedId);
      const clinician=await tx.user.findUnique({where:{id:data.clinicianId}});
      if(!clinician?.active || ![...ADMIN_ROLES,...CLINICIAN_ROLES].includes(clinician.role))throw new BadRequestException('Select an active clinician.');
      const record=await tx.admission.create({data:{visitId:data.visitId,bedId:data.bedId,clinicianId:data.clinicianId,events:{create:{action:'ADMITTED',details:data.reason,recordedBy:user.sub}}}});
      await tx.visit.update({where:{id:visit.id},data:{type:'INPATIENT',status:'ADMITTED',currentDepartment:'RECOVERY'}});
      await tx.workflowEvent.create({data:{visitId:visit.id,fromStatus:visit.status,toStatus:'ADMITTED',note:data.reason,changedById:user.sub}});
      return record;
    });
  }
  transfer(id:string,data:TransferDto,user:AuthenticatedUser) {
    if(![...ADMIN_ROLES,...CLINICIAN_ROLES,'RECOVERY_NURSE'].includes(user.role))throw new ForbiddenException();
    return this.operations.transaction(user,'ADMISSION_TRANSFERRED',async tx=>{
      const admission=await tx.admission.findUnique({where:{id},include:{bed:true}});
      if(!admission)throw new NotFoundException('Admission was not found.');
      if(admission.dischargedAt)throw new ConflictException('Admission is closed.');
      await this.operations.openVisit(tx,admission.visitId);
      const bed=await this.availableBed(tx,data.bedId);
      await tx.admissionEvent.create({data:{admissionId:id,action:'TRANSFERRED',details:`${admission.bed.ward}/${admission.bed.name} to ${bed.ward}/${bed.name}: ${data.reason}`,recordedBy:user.sub}});
      return tx.admission.update({where:{id},data:{bedId:bed.id}});
    });
  }
  discharge(id:string,data:DischargeDto,user:AuthenticatedUser) {
    this.clinical(user);
    return this.operations.transaction(user,'ADMISSION_DISCHARGED',async tx=>{
      const admission=await tx.admission.findUnique({where:{id},include:{visit:true}});
      if(!admission)throw new NotFoundException('Admission was not found.');
      if(admission.dischargedAt)throw new ConflictException('Admission is closed.');
      if(!visitTransitionsFor(user.role,admission.visit.status).includes('DISCHARGED'))throw new BadRequestException('Visit cannot be discharged.');
      await tx.visit.update({where:{id:admission.visitId},data:{status:'DISCHARGED',currentDepartment:null}});
      await tx.workflowEvent.create({data:{visitId:admission.visitId,fromStatus:admission.visit.status,toStatus:'DISCHARGED',note:data.summary,changedById:user.sub}});
      await tx.admissionEvent.create({data:{admissionId:id,action:'DISCHARGED',details:data.summary,recordedBy:user.sub}});
      return tx.admission.update({where:{id},data:{dischargedAt:new Date(),dischargeSummary:data.summary}});
    });
  }
  amend(kind:'care'|'labs',id:string,data:AmendmentDto,user:AuthenticatedUser) {
    return this.operations.transaction(user,kind==='care'?'CARE_AMENDED':'LAB_AMENDED',async tx=>{
      if(kind==='care') {
        const record=await tx.careEntry.findUnique({where:{id}});
        if(!record)throw new NotFoundException('Care entry was not found.');
        if(!canPerform(user.role,'care.'+record.department.toLowerCase()) || (!ADMIN_ROLES.includes(user.role)&&record.recordedBy!==user.sub))throw new ForbiddenException('Only the original author or an administrator may amend this note.');
      } else {
        if(!canPerform(user.role,'labs.result'))throw new ForbiddenException();
        const record=await tx.labOrder.findUnique({where:{id}});
        if(!record)throw new NotFoundException('Lab order was not found.');
        if(record.status!=='RESULTED')throw new BadRequestException('Only final results may be amended.');
      }
      return tx.recordAmendment.create({data:{...data,...(kind==='care'?{careEntryId:id}:{labOrderId:id}),recordedBy:user.sub}});
    });
  }
  reverse(id:string,reason:string,user:AuthenticatedUser) {
    if(![...ADMIN_ROLES,'ACCOUNTANT'].includes(user.role))throw new ForbiddenException('Accounting approval is required.');
    return this.operations.transaction(user,'PAYMENT_REVERSED',async tx=>{
      const payment=await tx.payment.findUnique({where:{id},include:{reversal:true}});
      if(!payment)throw new NotFoundException('Payment was not found.');
      if(payment.reversal)throw new ConflictException('Payment is already reversed.');
      return tx.paymentReversal.create({data:{paymentId:id,reason,recordedBy:user.sub}});
    });
  }
  chart(id:string,user:AuthenticatedUser) {
    if(!canPerform(user.role,'patients.read'))throw new ForbiddenException();
    return this.operations.transaction(user,'CHART_VIEWED',async tx=>{
      const record=await tx.visit.findUnique({where:{id},select:{id:true,visitNumber:true,status:true,type:true,reason:true,arrivedAt:true,patient:{select:{patientNumber:true,firstName:true,lastName:true,dateOfBirth:true,allergies:true,medicalAlerts:true}},careEntries:{where:{department:{in:careDepartmentsFor(user.role)}},include:{amendments:{orderBy:{createdAt:'asc'}}},orderBy:{createdAt:'asc'}},labOrders:canPerform(user.role,'labs.read')?{include:{amendments:{orderBy:{createdAt:'asc'}}},orderBy:{createdAt:'asc'}}:false,prescriptions:canPerform(user.role,'prescriptions.read')?{include:{stockItem:true},orderBy:{createdAt:'asc'}}:false,admission:{include:{bed:true,events:{orderBy:{createdAt:'asc'}}}}}});
      if(!record)throw new NotFoundException('Visit was not found.');
      return record;
    });
  }
}
