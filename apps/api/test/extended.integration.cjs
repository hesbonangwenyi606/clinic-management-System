const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID,randomBytes}=require('node:crypto');
const {hash}=require('bcryptjs');
const {PrismaClient}=require('@prisma/client');
const {NestFactory}=require('@nestjs/core');
const {configureApp}=require('../dist/app.setup');
const {AppModule}=require('../dist/app.module');
const {WorkflowsService}=require('../dist/workflows/workflows.service');
const {OperationsService}=require('../dist/operations/operations.service');
const {VisitsService}=require('../dist/visits/visits.service');
const {PatientsService}=require('../dist/patients/patients.service');

test('HTTP authorization, amendments, reversals and concurrent bed admission',async()=>{
  assert.equal(process.env.CMS_TEST_DATABASE,'true');
  assert.match(new URL(process.env.DATABASE_URL).pathname,/_test$/);
  process.env.JWT_SECRET??=randomBytes(48).toString('hex');
  const db=new PrismaClient(),ops=new OperationsService(db),visits=new VisitsService(db),patients=new PatientsService(db),flows=new WorkflowsService(db,ops);
  let app,admin,support;const patientIds=[],bedIds=[];
  const password='integration-password-'+randomUUID();
  try{
    const passwordHash=await hash(password,12);
    admin=await db.user.create({data:{email:`admin-${randomUUID()}@example.test`,passwordHash,firstName:'Integration',lastName:'Admin',role:'SUPER_ADMIN'}});
    support=await db.user.create({data:{email:`support-${randomUUID()}@example.test`,passwordHash,firstName:'Integration',lastName:'Catering',role:'CATERING_STAFF'}});
    const user={sub:admin.id,role:admin.role};
    const patient=await patients.create({firstName:'Extended',lastName:'Workflow'},admin.id);patientIds.push(patient.id);
    const secondPatient=await patients.create({firstName:'Second',lastName:'Workflow'},admin.id);patientIds.push(secondPatient.id);
    const visit=await visits.create({patientId:patient.id,type:'OUTPATIENT',reason:'Sensitive clinical reason'},admin.id);
    const second=await visits.create({patientId:secondPatient.id,type:'OUTPATIENT',reason:'Concurrent bed allocation'},admin.id);
    await visits.updateStatus(visit.id,{status:'IN_PROGRESS'},admin.id,'SUPER_ADMIN');
    const care=await ops.care({visitId:visit.id,department:'CLINICAL',summary:'Original clinical assessment',details:{diagnosis:'Initial diagnosis'}},user);
    await flows.amend('care',care.id,{text:'Additional history',reason:'History received later'},user);
    assert.equal((await db.careEntry.findUnique({where:{id:care.id}})).summary,'Original clinical assessment');
    const lab=await ops.lab({visitId:visit.id,testName:'Test panel'},user);
    await ops.result(lab.id,'Original result',user);
    await flows.amend('labs',lab.id,{text:'Corrected final result',reason:'Transcription correction'},user);
    assert.equal((await db.labOrder.findUnique({where:{id:lab.id}})).result,'Original result');
    const chart=await flows.chart(visit.id,user);assert.equal(chart.careEntries[0].amendments.length,1);assert.equal(chart.labOrders[0].amendments.length,1);

    const invoice=await ops.invoice({visitId:visit.id,description:'Clinical services',amountCents:10000},user);
    const payment=await ops.payment(invoice.id,{amountCents:10000,method:'CASH',reference:randomUUID()},user);
    await flows.reverse(payment.id,'Receipt entered incorrectly',user);
    await assert.rejects(flows.reverse(payment.id,'Duplicate reversal',user),{status:409});
    const report=await ops.reports(user);assert.equal(report.collectedCents,0);assert.equal(report.outstandingCents,10000);
    await ops.payment(invoice.id,{amountCents:10000,method:'CASH',reference:randomUUID()},user);
    assert.equal((await ops.reports(user)).outstandingCents,0);

    const bed=await flows.bed({ward:'Integration-'+randomUUID(),name:'1'},user);bedIds.push(bed.id);
    const bed2=await flows.bed({ward:bed.ward,name:'2'},user);bedIds.push(bed2.id);
    const competing=await Promise.allSettled([visit,second].map(v=>flows.admit({visitId:v.id,bedId:bed.id,clinicianId:admin.id,reason:'Observation'},user)));
    assert.equal(competing.filter(r=>r.status==='fulfilled').length,1,'Only one patient can occupy a bed.');
    const admission=competing.find(r=>r.status==='fulfilled').value;
    await assert.rejects(visits.updateStatus(admission.visitId,{status:'DISCHARGED'},admin.id,'SUPER_ADMIN'),{status:400});
    await flows.transfer(admission.id,{bedId:bed2.id,reason:'Ward change'},user);
    assert.equal((await db.admission.findUnique({where:{id:admission.id}})).bedId,bed2.id);
    await flows.discharge(admission.id,{summary:'Patient stable. Follow up in clinic.'},user);
    assert.equal((await db.visit.findUnique({where:{id:admission.visitId}})).status,'DISCHARGED');
    assert.equal((await flows.beds()).filter(b=>bedIds.includes(b.id)).every(b=>b.admissions.length===0),true);
    assert.equal(await db.admissionEvent.count({where:{admissionId:admission.id}}),3);

    app=configureApp(await NestFactory.create(AppModule,{logger:false}));await app.listen(0,'127.0.0.1');
    const base=(await app.getUrl())+'/api/v1';
    const login=async account=>{
      const result=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password})});
      assert.equal(result.status,201);return result.headers.get('set-cookie').split(';')[0];
    };
    assert.equal((await fetch(base+'/patients')).status,401);
    const cookie=await login(support);
    const listed=await fetch(base+'/visits',{headers:{cookie}});assert.equal(listed.status,200);assert.equal(listed.headers.get('cache-control'),'no-store');
    const records=await listed.json();assert.ok(records.length);assert.equal('reason' in records[0],false);assert.equal('phone' in records[0].patient,false);
    assert.equal((await fetch(base+'/visits/'+second.id+'/status',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({status:'ADMITTED'})})).status,403);
    assert.equal((await fetch(base+'/operations/reports',{headers:{cookie}})).status,403);
    const adminCookie=await login(admin);
    assert.equal((await fetch(base+'/patients',{method:'POST',headers:{cookie:adminCookie,Origin:'https://untrusted.example','Content-Type':'application/json'},body:JSON.stringify({firstName:'Bad',lastName:'Origin'})})).status,403);
    assert.equal((await fetch(base+'/operations/stock',{method:'POST',headers:{cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify({unknown:true})})).status,400);
    const logout=await fetch(base+'/auth/logout',{method:'POST',headers:{cookie:adminCookie}});assert.equal(logout.status,201);
    assert.equal((await fetch(base+'/auth/me',{headers:{cookie:adminCookie}})).status,401,'Logged-out JWT cannot be replayed.');
    assert.equal((await fetch(base+'/auth/logout',{method:'POST',headers:{cookie:'cms_session=expired'}})).status,201);
  }finally{
    if(app)await app.close();
    if(admin)await db.$transaction(async tx=>{
      const where={visit:{createdById:admin.id}};
      await tx.recordAmendment.deleteMany({where:{recordedBy:admin.id}});
      await tx.paymentReversal.deleteMany({where:{recordedBy:admin.id}});
      await tx.admissionEvent.deleteMany({where:{recordedBy:admin.id}});
      await tx.admission.deleteMany({where:{clinicianId:admin.id}});
      await tx.payment.deleteMany({where:{invoice:{visit:{createdById:admin.id}}}});await tx.invoice.deleteMany({where});
      await tx.careEntry.deleteMany({where});await tx.labOrder.deleteMany({where});await tx.workflowEvent.deleteMany({where});
      await tx.visit.deleteMany({where:{createdById:admin.id}});await tx.patient.deleteMany({where:{id:{in:patientIds}}});
      await tx.bed.deleteMany({where:{id:{in:bedIds}}});
      await tx.auditLog.deleteMany({where:{userId:{in:[admin.id,...(support?[support.id]:[])]}}});
      await tx.user.deleteMany({where:{id:{in:[admin.id,...(support?[support.id]:[])]}}});
    });
    await db.$disconnect();
  }
});
