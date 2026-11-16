const {test}=require('node:test');
const assert=require('node:assert/strict');
const {OperationsService}=require('../dist/operations/operations.service');
const {VisitsService}=require('../dist/visits/visits.service');
const user=(role='SUPER_ADMIN')=>({sub:'actor',role});
function service(tx={}) {
 const audits=[];tx.auditLog={create:async({data})=>audits.push(data)};
 return {service:new OperationsService({$transaction:async fn=>fn(tx)}),audits};
}
test('role checks reject unrelated modules and writes',()=>{
 const {service:s}=service();
 assert.throws(()=>s.allow(user('CATERING_STAFF'),'invoices'),{status:403});
 assert.throws(()=>s.lab({visitId:'v',testName:'CBC'},user('LAB_TECHNICIAN')),{status:403});
 assert.throws(()=>s.stock({},user('CLINICIAN_1')),{status:403});
});
test('overpayment is rejected before writing a payment',async()=>{
 const {service:s,audits}=service({invoice:{findUnique:async()=>({amountCents:10000,payments:[{amountCents:6000}]})}});
 await assert.rejects(s.payment('i',{amountCents:4001},user()),{status:400});assert.equal(audits.length,0);
});
test('partial payment is saved with its actor and audit',async()=>{
 const {service:s,audits}=service({invoice:{findUnique:async()=>({amountCents:10000,payments:[{amountCents:6000}]})},payment:{create:async({data})=>({id:'payment',...data})}});
 const result=await s.payment('i',{amountCents:4000,reference:'r',method:'CASH'},user());
 assert.equal(result.recordedBy,'actor');assert.equal(result.invoiceId,'i');assert.equal(audits[0].action,'PAYMENT_RECORDED');
});
test('dispensing rejects expired, insufficient and already dispensed stock',async()=>{
 for(const change of [{dispensedAt:new Date()},{stockItem:{expiresAt:new Date(0),quantity:100}},{stockItem:{expiresAt:new Date(Date.now()+86400000),quantity:1}}]) {
  const {service:s}=service({prescription:{findUnique:async()=>({id:'rx',visitId:'v',quantity:2,stockItem:{expiresAt:new Date(Date.now()+86400000),quantity:20},...change})},visit:{findUnique:async()=>({status:'IN_PROGRESS'})}});
  await assert.rejects(s.dispense('rx',user()),error=>[400,409].includes(error.status));
 }
});
test('dispensing reduces stock, records usage, and stamps the prescription',async()=>{
 let decremented,movement;
 const {service:s,audits}=service({prescription:{findUnique:async()=>({id:'rx',visitId:'v',stockItemId:'stock',quantity:2,stockItem:{expiresAt:new Date(Date.now()+86400000),quantity:20}}),update:async({data})=>({id:'rx',...data})},visit:{findUnique:async()=>({status:'IN_PROGRESS'})},stockItem:{update:async args=>decremented=args},stockMovement:{create:async({data})=>movement=data}});
 const rx=await s.dispense('rx',user('PHARMACIST'));assert.equal(decremented.data.quantity.decrement,2);assert.equal(movement.quantity,-2);assert.equal(rx.dispensedBy,'actor');assert.ok(rx.dispensedAt);assert.equal(audits.length,1);
});
test('stock cannot be adjusted below zero',async()=>{
 const {service:s}=service({stockItem:{findUnique:async()=>({quantity:3})}});
 await assert.rejects(s.movement('s',{quantity:-4,reason:'Correction'},user()),{status:400});
});
test('lab results are final and cannot be overwritten',async()=>{
 const {service:s}=service({labOrder:{findUnique:async()=>({status:'RESULTED'})}});
 await assert.rejects(s.result('lab','replacement',user()),{status:409});
});
test('care cannot be entered on a discharged visit',async()=>{
 const {service:s}=service({visit:{findUnique:async()=>({status:'DISCHARGED'})}});
 await assert.rejects(s.care({visitId:'v',department:'TRIAGE',summary:'note',details:{}},user()),{status:400});
});
test('past appointments and self deactivation are rejected',()=>{
 const {service:s}=service();assert.throws(()=>s.appointment({scheduledAt:new Date(0).toISOString()},user()),{status:400});assert.throws(()=>s.deactivate('actor',user()),{status:400});
});
test('terminal visit transitions are rejected',async()=>{
 const s=new VisitsService({$transaction:async fn=>fn({visit:{findUnique:async()=>({status:'DISCHARGED'})}})});
 await assert.rejects(s.updateStatus('v',{status:'IN_PROGRESS'},'actor'),{status:400});
});
test('concurrent visit update is rejected without history writes',async()=>{
 const s=new VisitsService({$transaction:async fn=>fn({visit:{findUnique:async()=>({status:'WAITING'}),updateMany:async()=>({count:0})}})});
 await assert.rejects(s.updateStatus('v',{status:'IN_PROGRESS'},'actor'),{status:409});
});
test('patient portal resolves ownership from the signed-in account',async()=>{
 let accountQuery,patientQuery;
 const s=new OperationsService({user:{findUnique:async q=>{accountQuery=q;return {patientId:'own-patient'};}},patient:{findUniqueOrThrow:async q=>{patientQuery=q;return {patientNumber:'P-own'};}}});
 const result=await s.portal({sub:'signed-in-user',role:'PATIENT'});
 assert.equal(accountQuery.where.id,'signed-in-user');assert.equal(patientQuery.where.id,'own-patient');assert.equal(result.patientNumber,'P-own');
 await assert.rejects(s.portal(user('RECEPTIONIST')),{status:403});
 assert.throws(()=>s.allow(user('PATIENT'),'staff'),{status:403});
 assert.throws(()=>s.allow(user('PATIENT'),'invoices'),{status:403});
});
test('patient account provisioning requires an explicit valid patient link',async()=>{
 const {plainToInstance}=require('class-transformer');const {validate}=require('class-validator');const {StaffDto}=require('../dist/operations/operations.dto');
 const fields={firstName:'Patient',lastName:'User',email:'patient@example.test',password:'long-password-for-test',role:'PATIENT'};
 assert.ok((await validate(plainToInstance(StaffDto,fields))).some(e=>e.property==='patientId'));
 assert.equal((await validate(plainToInstance(StaffDto,{...fields,patientId:'10dc41c6-0cd8-4a15-b2ac-17386c820518'}))).length,0);
});
test('invalid vital signs are rejected on the server',()=>{
 const {service:s}=service();
 assert.throws(()=>s.care({visitId:'v',department:'TRIAGE',summary:'Vitals',details:{pulse:9999}},user()),{status:400});
 assert.throws(()=>s.care({visitId:'v',department:'TRIAGE',summary:'Vitals',details:{temperature:'warm'}},user()),{status:400});
});
test('only accounting roles can record expenses',()=>{
 const {service:s}=service();assert.throws(()=>s.expense({},user('RECEPTIONIST')),{status:403});
 assert.throws(()=>s.expense({description:'',reference:'x'},user('ACCOUNTANT')),{status:400});
});

test('administrators see every department and can manage staff roles',()=>{
 const {modulesFor,canPerform}=require('@cms/access');
 for(const role of ['SUPER_ADMIN','CLINIC_ADMIN']) {
  assert.equal(modulesFor(role).length,14);
  for(const action of ['patients.create','visits.create','visits.status','stock.adjust','staff.update','invoices.create']) assert.equal(canPerform(role,action),true);
 }
});
test('receptionists can register and open visits but cannot change records or enter departments',async()=>{
 const {modulesFor,canPerform}=require('@cms/access');const {Reflector}=require('@nestjs/core');const {RolesGuard}=require('../dist/auth/roles.guard');const {VisitsController}=require('../dist/visits/visits.controller');const {PatientsController}=require('../dist/patients/patients.controller');
 assert.deepEqual(modulesFor('RECEPTIONIST'),[]);
 for(const action of ['patients.read','patients.create','visits.read','visits.create','visits.history']) assert.equal(canPerform('RECEPTIONIST',action),true);
 for(const action of ['visits.status','invoices.create','appointments.create','care.clinical','staff.update']) assert.equal(canPerform('RECEPTIONIST',action),false);
 const {service:s}=service();for(const area of ['care','labs','stock','movements','prescriptions','invoices','appointments','expenses','staff','reports','audit']) await assert.rejects(s.list(area,user('RECEPTIONIST')),{status:403});
 const guard=new RolesGuard(new Reflector());
 function context(controller,method) {return {getHandler:()=>controller.prototype[method],getClass:()=>controller,switchToHttp:()=>({getRequest:()=>({user:user('RECEPTIONIST')})})};}
 assert.equal(guard.canActivate(context(PatientsController,'create')),true);
 assert.equal(guard.canActivate(context(VisitsController,'create')),true);
 assert.equal(guard.canActivate(context(VisitsController,'history')),true);
 assert.throws(()=>guard.canActivate(context(VisitsController,'updateStatus')),{status:403});
});
test('all three clinician roles have exactly the requested five department tabs',async()=>{
 const {modulesFor,canPerform}=require('@cms/access');
 for(const role of ['CLINICIAN_1','CLINICIAN_2','CLINICIAN_3']) {
  assert.deepEqual(modulesFor(role),['clinical','labs','stock','movements','recovery']);
  const {service:s}=service();
  for(const area of ['care','labs','stock','movements']) assert.doesNotThrow(()=>s.allow(user(role),area));
  for(const area of ['invoices','appointments','expenses','staff','reports','audit']) await assert.rejects(s.list(area,user(role)),{status:403});
  for(const action of ['stock.create','stock.adjust','care.recovery','labs.result','staff.update']) assert.equal(canPerform(role,action),false);
  for(const action of ['care.clinical','labs.create','prescriptions.create']) assert.equal(canPerform(role,action),true);
 }
});
test('care reads are limited to the role departments on the server',async()=>{
 let args;const s=new OperationsService({careEntry:{findMany:async query=>{args=query;return [];}}});
 await s.list('care',user('CLINICIAN_2'));assert.deepEqual(args.where.department.in,['CLINICAL','RECOVERY']);
 await s.list('care',user('SUPER_ADMIN'));assert.deepEqual(args.where.department.in,['TRIAGE','CLINICAL','RECOVERY','CATERING']);
});
test('staff role changes are audited and cannot elevate peers or change own role',async()=>{
 const {service:s,audits}=service({user:{findUnique:async()=>({id:'staff',role:'RECEPTIONIST'}),update:async({data})=>({id:'staff',...data})}});
 const changed=await s.updateRole('staff','CLINICIAN_1',user());assert.equal(changed.role,'CLINICIAN_1');assert.equal(audits[0].action,'STAFF_ROLE_CHANGED');
 assert.throws(()=>s.updateRole('actor','RECEPTIONIST',user()),{status:400});
 assert.throws(()=>s.updateRole('staff','SUPER_ADMIN',user()),{status:400});
 assert.throws(()=>s.updateRole('staff','CLINICIAN_1',user('RECEPTIONIST')),{status:403});
 await assert.rejects(s.updateRole('staff','CLINIC_ADMIN',user('CLINIC_ADMIN')),{status:403});
});

test('report date filters include the full Nairobi day and reject invalid ranges',()=>{
 const {parseReportFilters}=require('../dist/reports/report-filters');
 const {dateRange}=parseReportFilters({from:'2026-11-16',to:'2026-11-16'});
 assert.equal(dateRange.gte.toISOString(),'2026-11-15T21:00:00.000Z');
 assert.equal(dateRange.lt.toISOString(),'2026-11-16T21:00:00.000Z');
 assert.equal(parseReportFilters({}).dateRange,undefined);
 for(const filters of [{from:'2026-02-30'},{from:'2026-11-17',to:'2026-11-16'},{from:'16/11/2026'},{status:'UNKNOWN'},{department:'UNKNOWN'},{method:'UNKNOWN'},{from:['2026-11-16']}]) assert.throws(()=>parseReportFilters(filters),{status:400});
});
test('reports apply scoped filters and retain all-date outstanding balances',async()=>{
 const calls=[];const capture=(name,result)=>args=>{calls.push({name,args});return Promise.resolve(result);};
 const db={
  patient:{count:capture('patients',4)},visit:{groupBy:capture('visits',[{status:'COMPLETED',_count:2}])},
  invoice:{aggregate:args=>{calls.push({name:'invoices',args});return Promise.resolve({_sum:{amountCents:args.where?10000:50000}});}},
  payment:{groupBy:capture('payments',[{method:'CASH',_sum:{amountCents:3000}}]),aggregate:capture('allPayments',{_sum:{amountCents:25000}})},
  stockItem:{findMany:capture('stock',[])},labOrder:{count:capture('labs',1)},appointment:{count:capture('appointments',2)},
  careEntry:{groupBy:capture('care',[])},prescription:{groupBy:capture('dispensed',[])},expense:{aggregate:capture('expenses',{_sum:{amountCents:500}})},
  $queryRaw:capture('served',[{count:2n}]),$transaction:async queries=>Promise.all(queries),
 };
 const result=await new OperationsService(db).reports(user(),{from:'2026-11-16',to:'2026-11-16',status:'COMPLETED',department:'RECOVERY',method:'CASH'});
 assert.equal(result.billedCents,10000);assert.equal(result.collectedCents,3000);assert.equal(result.expensesCents,500);assert.equal(result.outstandingCents,25000);assert.equal(result.patientsServed,2);
 const call=name=>calls.find(c=>c.name===name).args;
 assert.equal(call('visits').where.status,'COMPLETED');assert.equal(call('care').where.department,'RECOVERY');assert.equal(call('payments').where.method,'CASH');
 for(const [name,field] of [['patients','createdAt'],['visits','arrivedAt'],['payments','createdAt'],['care','createdAt'],['dispensed','dispensedAt'],['expenses','incurredAt'],['appointments','scheduledAt']]) assert.equal(call(name).where[field].gte.toISOString(),'2026-11-15T21:00:00.000Z');
 assert.equal(call('allPayments').where,undefined);assert.equal(call('stock').where,undefined);
 assert.equal(result.filters.timezone,'Africa/Nairobi');
 await assert.rejects(new OperationsService(db).reports(user('RECEPTIONIST'),{}),{status:403});
 await assert.rejects(new OperationsService(db).reports(user('CLINICIAN_1'),{}),{status:403});
});
