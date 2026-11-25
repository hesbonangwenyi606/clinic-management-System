const {test}=require('node:test');
const assert=require('node:assert/strict');
const {WorkflowsService}=require('../dist/workflows/workflows.service');
const {OperationsService}=require('../dist/operations/operations.service');
const {VisitsService}=require('../dist/visits/visits.service');
const {visitTransitionsFor}=require('@cms/access');
const actor=(role='SUPER_ADMIN')=>({sub:'actor',role});
function workflows(tx={}) {
  const audits=[];
  tx.auditLog={create:async ({data})=>audits.push(data)};
  const db={$transaction:async work=>work(tx)};
  const ops=new OperationsService(db);
  return {service:new WorkflowsService(db,ops),ops,audits};
}

test('nonclinical departments cannot admit, complete or discharge patients',async()=>{
  for(const role of ['CATERING_STAFF','CASHIER','ACCOUNTANT','PHARMACIST','LAB_TECHNICIAN','RECEPTIONIST']) {
    for(const status of ['REGISTERED','IN_PROGRESS','ADMITTED','UNDER_OBSERVATION'])assert.deepEqual(visitTransitionsFor(role,status),[]);
    const visits=new VisitsService({$transaction:async work=>work({visit:{findUnique:async()=>({status:'IN_PROGRESS'})}})});
    await assert.rejects(visits.updateStatus('visit',{status:'DISCHARGED'},'actor',role),{status:403});
  }
  assert.deepEqual(visitTransitionsFor('ATTENDANT','REGISTERED'),['WAITING','IN_PROGRESS']);
  assert.deepEqual(visitTransitionsFor('RECOVERY_NURSE','ADMITTED'),['IN_PROGRESS','UNDER_OBSERVATION']);
});

test('all clinically completed visits reject new care and dispensing',async()=>{
  for(const status of ['COMPLETED','DISCHARGED','CANCELLED']) {
    const {ops}=workflows({visit:{findUnique:async()=>({status})}});
    await assert.rejects(ops.openVisit({visit:{findUnique:async()=>({status})}},'v'),{status:400});
  }
});

test('archived patients cannot receive or reactivate portal accounts',async()=>{
  let writes=0;
  const {ops}=workflows({patient:{findUnique:async()=>({archivedAt:new Date()})},user:{findUnique:async()=>({role:'PATIENT',patientId:'p'}),create:async()=>writes++,update:async()=>writes++}});
  await assert.rejects(ops.staff({role:'PATIENT',patientId:'p',password:'long-patient-password',email:'p@example.test',firstName:'P',lastName:'Test'},actor()),{status:400});
  await assert.rejects(ops.reactivate('patient-account',actor()),{status:400});
  assert.equal(writes,0);
});

test('department restriction is applied before pagination and cannot be bypassed',async()=>{
  let args;
  const db={careEntry:{findMany:async q=>(args=q,[])}};
  const ops=new OperationsService(db);
  await ops.list('care',actor('CLINICIAN_1'),{department:'TRIAGE',page:'3',pageSize:'25'});
  assert.equal(args.where.department,'TRIAGE');assert.equal(args.skip,50);assert.equal(args.take,25);
  await assert.rejects(ops.list('care',actor('CLINICIAN_1'),{department:'CATERING'}),{status:403});
  for(const query of [{page:'0'},{page:'-1'},{page:['1']},{pageSize:'garbage'},{visitId:'garbage'},{search:['x']}]) await assert.rejects(ops.list('care',actor('CLINICIAN_1'),query),{status:400});
});

test('visit list omits clinical reason and phone for administrative support roles',async()=>{
  let query;const service=new VisitsService({visit:{findMany:async q=>(query=q,[])}});
  await service.list(undefined,'CATERING_STAFF');assert.equal(query.select.reason,false);assert.equal(query.select.patient.select.phone,false);
  await service.list('OPEN','CLINICIAN_1',{search:'older-patient',page:'4'});assert.equal(query.select.reason,true);assert.equal(query.skip,150);assert.ok(query.where.OR);
});

test('clinicians cannot amend someone else’s clinical note',async()=>{
  const {service,audits}=workflows({careEntry:{findUnique:async()=>({department:'CLINICAL',recordedBy:'other'})}});
  await assert.rejects(service.amend('care','note',{text:'replacement',reason:'Correction'},actor('CLINICIAN_1')),{status:403});assert.equal(audits.length,0);
});

test('amendments preserve the original final result',async()=>{
  let amendment;const {service,audits}=workflows({labOrder:{findUnique:async()=>({status:'RESULTED',result:'original'}),update:async()=>assert.fail('Original result must remain unchanged')},recordAmendment:{create:async({data})=>(amendment={id:'a',...data})}});
  await service.amend('labs','lab',{text:'Corrected result',reason:'Transcription correction'},actor('LAB_TECHNICIAN'));
  assert.equal(amendment.labOrderId,'lab');assert.equal(amendment.recordedBy,'actor');assert.equal(audits[0].action,'LAB_AMENDED');
});

test('only accounting approvers may reverse receipts and only once',async()=>{
  let writes=0;let reversal=null;
  const {service,audits}=workflows({payment:{findUnique:async()=>({reversal})},paymentReversal:{create:async({data})=>(writes++,reversal={id:'r',...data})}});
  assert.throws(()=>service.reverse('payment','Correction',actor('CASHIER')),{status:403});
  await service.reverse('payment','Correction',actor('ACCOUNTANT'));
  await assert.rejects(service.reverse('payment','Again',actor('ACCOUNTANT')),{status:409});assert.equal(writes,1);assert.equal(audits.length,1);
});

test('occupied beds reject admissions without changing the visit',async()=>{
  const {service,audits}=workflows({visit:{findUnique:async()=>({id:'v',status:'IN_PROGRESS',patientId:'p'}),update:async()=>assert.fail('Visit must not change')},patient:{findUnique:async()=>({archivedAt:null})},admission:{findFirst:async()=>null},bed:{findUnique:async()=>({active:true,admissions:[{id:'occupied'}]})}});
  await assert.rejects(service.admit({visitId:'v',bedId:'bed',clinicianId:'c',reason:'Observation'},actor('CLINICIAN_1')),{status:409});assert.equal(audits.length,0);
});

test('direct visit discharge cannot bypass an active admission',async()=>{
  const visits=new VisitsService({$transaction:async work=>work({visit:{findUnique:async()=>({status:'ADMITTED'}),updateMany:async()=>assert.fail('Must use discharge workflow')},admission:{findUnique:async()=>({dischargedAt:null})}})});
  await assert.rejects(visits.updateStatus('v',{status:'DISCHARGED'},'actor','SUPER_ADMIN'),{status:400});
});

test('logout revokes tokens and expired tokens do not prevent clearing the session',async()=>{
  const {AuthService}=require('../dist/auth/auth.service');let version=0,audits=0;
  const tx={user:{updateMany:async q=>{assert.equal(q.where.sessionVersion,2);version++;return {count:1};}},auditLog:{create:async()=>audits++}};
  const auth=new AuthService({$transaction:async work=>work(tx)},{verifyAsync:async()=>({sub:'u',sessionVersion:2})});
  await auth.signOut('valid');assert.equal(version,1);assert.equal(audits,1);
  const expired=new AuthService({}, {verifyAsync:async()=>{throw Error('expired');}});
  await expired.signOut('expired');await expired.signOut();
});

test('password changes and recovery reject passwords shorter than 14 characters',async()=>{
  const {AuthService}=require('../dist/auth/auth.service');
  const auth=new AuthService({},{});
  await assert.rejects(auth.changePassword('u','current','short-pass'),{status:400});
  await assert.rejects(auth.resetRecovery('user@example.test','123456','short-pass'),{status:400});
});

test('routes without an explicit authorization policy deny access',()=>{
  const {RolesGuard}=require('../dist/auth/roles.guard');
  const guard=new RolesGuard({getAllAndOverride:()=>undefined});
  assert.throws(()=>guard.canActivate({getHandler:()=>null,getClass:()=>null}),{status:403});
});
