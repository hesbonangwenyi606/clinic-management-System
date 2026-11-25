import { BadRequestException, Body, Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Post, ServiceUnavailableException } from '@nestjs/common';
import { IsDefined, IsInt, IsObject, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreatePatientDto } from '../patients/dto/create-patient.dto';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Prisma, UserRole } from '@prisma/client';
import { rolesFor } from '@cms/access';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';

class StartDto {
  @IsDefined() @IsObject() @ValidateNested() @Type(() => CreatePatientDto) patient!: CreatePatientDto;
  @IsInt() @Min(1) @Max(150000) amount!: number;
  @IsString() @Matches(/^(?:254|0)[17]\d{8}$/) phone!: string;
}
const endpoint = 'https://sandbox.safaricom.co.ke';
const digest = (value:string) => createHash('sha256').update(value).digest('hex');
const timestamp = () => new Date(Date.now()+3*3600000).toISOString().replace(/[-:TZ.]/g,'').slice(0,14);

@Injectable()
export class MpesaService {
  constructor(private readonly db:PrismaService) {}
  private config() {
    const {MPESA_ENVIRONMENT,MPESA_CONSUMER_KEY,MPESA_CONSUMER_SECRET,MPESA_SHORTCODE,MPESA_PASSKEY,MPESA_CALLBACK_URL}=process.env;
    if(MPESA_ENVIRONMENT!=='sandbox' || !MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET || !MPESA_SHORTCODE || !MPESA_PASSKEY || !MPESA_CALLBACK_URL) throw new ServiceUnavailableException('M-Pesa sandbox is not configured.');
    let callback:URL;
    try {callback=new URL(MPESA_CALLBACK_URL);} catch {throw new ServiceUnavailableException('M-Pesa callback URL is invalid.');}
    if(callback.protocol!=='https:' || callback.search || callback.hash || !callback.pathname.replace(/\/$/,'').endsWith('/api/v1/mpesa/callback') || !/^\d{5,10}$/.test(MPESA_SHORTCODE)) throw new ServiceUnavailableException('M-Pesa sandbox settings are invalid.');
    return {key:MPESA_CONSUMER_KEY,secret:MPESA_CONSUMER_SECRET,shortcode:MPESA_SHORTCODE,passkey:MPESA_PASSKEY,callback:callback.toString().replace(/\/$/,'')};
  }
  private async token(c:ReturnType<MpesaService['config']>) {
    const res=await fetch(`${endpoint}/oauth/v1/generate?grant_type=client_credentials`,{headers:{Authorization:`Basic ${Buffer.from(`${c.key}:${c.secret}`).toString('base64')}`},signal:AbortSignal.timeout(15000)});
    const body=await res.json() as {access_token?:string};
    if(!res.ok || !body.access_token) throw new Error('Unable to authenticate with M-Pesa.');
    return body.access_token;
  }
  async start(data:StartDto,user:AuthenticatedUser) {
    const c=this.config();
    const phone=data.phone.startsWith('0') ? `254${data.phone.slice(1)}` : data.phone;
    const token=randomBytes(32).toString('hex');
    if (!data.patient || !data.patient.firstName.trim() || !data.patient.lastName.trim()) throw new BadRequestException('Patient names cannot be blank.');
    if (data.patient.dateOfBirth && new Date(data.patient.dateOfBirth) > new Date()) throw new BadRequestException('Date of birth cannot be in the future.');
    const attempt=await this.db.mpesaAttempt.create({data:{createdById:user.sub,phone,amount:data.amount,tokenHash:digest(token),pendingPatient:JSON.parse(JSON.stringify(data.patient))}});
    try {
      const access=await this.token(c);const time=timestamp();
      const res=await fetch(`${endpoint}/mpesa/stkpush/v1/processrequest`,{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({BusinessShortCode:c.shortcode,Password:Buffer.from(`${c.shortcode}${c.passkey}${time}`).toString('base64'),Timestamp:time,TransactionType:'CustomerPayBillOnline',Amount:data.amount,PartyA:phone,PartyB:c.shortcode,PhoneNumber:phone,CallBackURL:`${c.callback}/${token}`,AccountReference:'CONSULTATION',TransactionDesc:'Consultation fee'}),signal:AbortSignal.timeout(20000)});
      const body=await res.json() as {ResponseCode?:string;CheckoutRequestID?:string};
      if(!res.ok || body.ResponseCode!=='0' || !body.CheckoutRequestID) throw new Error('M-Pesa did not accept the request.');
      await this.db.mpesaAttempt.update({where:{id:attempt.id},data:{status:'PENDING',checkoutId:body.CheckoutRequestID}});
      return {id:attempt.id,status:'PENDING'};
    } catch {
      await this.db.mpesaAttempt.update({where:{id:attempt.id},data:{status:'UNKNOWN',message:'Prompt status could not be determined. Do not retry until reconciled.'}});
      return {id:attempt.id,status:'UNKNOWN'};
    }
  }
  async status(id:string) {
    const attempt=await this.db.mpesaAttempt.findUnique({where:{id},select:{status:true,message:true}});
    if(!attempt) throw new BadRequestException('Payment request not found.');
    return attempt;
  }
  async callback(token:string,body:unknown) {
    if(!/^[a-f0-9]{64}$/.test(token)) return;
    const attempt=await this.db.mpesaAttempt.findUnique({where:{tokenHash:digest(token)}});
    if(!attempt) return;
    if(attempt.status==='INITIATING') throw new ServiceUnavailableException('Payment request is still being recorded.');
    if(attempt.status!=='PENDING' || !attempt.checkoutId) return;
    const callback=(body as {Body?:{stkCallback?:{CheckoutRequestID?:string;ResultCode?:number;CallbackMetadata?:{Item?:{Name?:string;Value?:string|number}[]}}}})?.Body?.stkCallback;
    if(!callback || callback.CheckoutRequestID!==attempt.checkoutId || !Number.isInteger(callback.ResultCode)) return;
    const items=callback.CallbackMetadata?.Item ?? [];
    const get=(name:string)=>items.find(item=>item.Name===name)?.Value;
    const receipt=String(get('MpesaReceiptNumber') ?? '');
    if(callback.ResultCode===0 && (Number(get('Amount'))!==attempt.amount || String(get('PhoneNumber'))!==attempt.phone || !/^[A-Za-z0-9]{5,30}$/.test(receipt))) throw new ServiceUnavailableException('Payment details require reconciliation.');
    try {
      const c=this.config();const access=await this.token(c);const time=timestamp();
      const res=await fetch(`${endpoint}/mpesa/stkpushquery/v1/query`,{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({BusinessShortCode:c.shortcode,Password:Buffer.from(`${c.shortcode}${c.passkey}${time}`).toString('base64'),Timestamp:time,CheckoutRequestID:attempt.checkoutId}),signal:AbortSignal.timeout(20000)});
      const query=await res.json() as {ResponseCode?:string;ResultCode?:string|number;CheckoutRequestID?:string};
      if(!res.ok || query.ResponseCode!=='0' || String(query.ResultCode)!==String(callback.ResultCode) || query.CheckoutRequestID!==attempt.checkoutId) throw new Error('Payment result not verified.');
      if(callback.ResultCode!==0){const cancelled=callback.ResultCode===1032;await this.db.mpesaAttempt.updateMany({where:{id:attempt.id,status:'PENDING'},data:{status:cancelled?'CANCELLED':'FAILED',message:cancelled?'Payment cancelled by the customer.':'M-Pesa reported that payment was not completed.'}});return;}
      await this.db.$transaction(async tx=>{
        const changed=await tx.mpesaAttempt.updateMany({where:{id:attempt.id,status:'PENDING'},data:{status:'CONFIRMED',message:'Payment confirmed by M-Pesa.'}});
        if(!changed.count)return;
        let invoiceId=attempt.invoiceId;
        if (!invoiceId) {
          if (!attempt.pendingPatient) throw new Error('Pending patient details are missing.');
          const data=attempt.pendingPatient as unknown as CreatePatientDto;
          const patient=await tx.patient.create({data:{...data,firstName:data.firstName.trim(),lastName:data.lastName.trim(),email:data.email?.trim().toLowerCase(),dateOfBirth:data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,patientNumber:`P-${randomUUID().toUpperCase()}`}});
          const visit=await tx.visit.create({data:{patientId:patient.id,visitNumber:`V-${randomUUID().toUpperCase()}`,type:'OUTPATIENT',reason:'Consultation',createdById:attempt.createdById,workflowEvents:{create:{toStatus:'REGISTERED',note:'Consultation visit registered',changedById:attempt.createdById}}}});
          const invoice=await tx.invoice.create({data:{visitId:visit.id,description:'Consultation fee',amountCents:attempt.amount*100,createdBy:attempt.createdById}});
          invoiceId=invoice.id;
          await tx.mpesaAttempt.update({where:{id:attempt.id},data:{invoiceId,pendingPatient:Prisma.DbNull}});
          await tx.auditLog.create({data:{userId:attempt.createdById,action:'PATIENT_CREATED',entityType:'Patient',entityId:patient.id}});
          await tx.auditLog.create({data:{userId:attempt.createdById,action:'CONSULTATION_CREATED',entityType:'Visit',entityId:visit.id}});
        }
        const invoice=await tx.invoice.findUniqueOrThrow({where:{id:invoiceId},include:{payments:{where:{reversal:null}}}});
        if(invoice.payments.reduce((sum,p)=>sum+p.amountCents,0)+attempt.amount*100>invoice.amountCents) throw new Error('Invoice balance changed.');
        await tx.payment.create({data:{invoiceId,amountCents:attempt.amount*100,method:'MPESA_RECORDED',reference:receipt,recordedBy:attempt.createdById}});
        await tx.auditLog.create({data:{userId:attempt.createdById,action:'MPESA_PAYMENT_CONFIRMED',entityType:'Invoice',entityId:invoiceId}});
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    } catch { throw new ServiceUnavailableException('Payment confirmation requires reconciliation.'); }
  }
}
@Controller('mpesa')
class MpesaController {
  constructor(private readonly service:MpesaService) {}
  @Post('consultation') @Roles(...rolesFor('patients.create') as UserRole[]) start(@Body() data:StartDto,@CurrentUser() user:AuthenticatedUser){return this.service.start(data,user);}
  @Get('consultation/:id') @Roles(...rolesFor('patients.create') as UserRole[]) status(@Param('id',ParseUUIDPipe) id:string){return this.service.status(id);}
  @Public() @Post('callback/:token') async callback(@Param('token') token:string,@Body() body:unknown){await this.service.callback(token,body);return {ResultCode:0,ResultDesc:'Accepted'};}
}
@Module({controllers:[MpesaController],providers:[MpesaService]})
export class MpesaModule {}
