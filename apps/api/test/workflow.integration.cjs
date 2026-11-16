const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');
const {OperationsService}=require('../dist/operations/operations.service');
const {PatientsService}=require('../dist/patients/patients.service');
const {VisitsService}=require('../dist/visits/visits.service');

test('PostgreSQL patient-to-discharge workflow, rollback and concurrent payments',async()=>{
 assert.equal(process.env.CMS_TEST_DATABASE,'true','Set CMS_TEST_DATABASE=true only for a disposable test database.');
 assert.match(new URL(process.env.DATABASE_URL).pathname,/_test$/,'Integration tests require a database name ending in _test.');
 const db=new PrismaClient();const ops=new OperationsService(db);const patients=new PatientsService(db);const visits=new VisitsService(db);
 let actor,patient,visit,stock;
 try {
  actor=await db.user.create({data:{email:`integration-${randomUUID()}@example.test`,passwordHash:'unused-test-only',firstName:'Test',lastName:'Operator',role:'SUPER_ADMIN'}});
  const user={sub:actor.id,role:actor.role};
  patient=await patients.create({firstName:'Integration',lastName:'Patient'},actor.id);
  visit=await visits.create({patientId:patient.id,type:'OUTPATIENT',reason:'Integration check'},actor.id);
  await visits.updateStatus(visit.id,{status:'IN_PROGRESS'},actor.id);
  await ops.care({visitId:visit.id,department:'TRIAGE',summary:'Vitals recorded',details:{temperature:37,pulse:80}},user);
  const lab=await ops.lab({visitId:visit.id,testName:'Test order'},user);
  await ops.result(lab.id,'Test result',user);
  stock=await ops.stock({name:`Test medicine ${randomUUID()}`,batch:'test',expiresAt:new Date(Date.now()+86400000*90).toISOString(),quantity:10,reorderLevel:2},user);
  const rx=await ops.prescribe({visitId:visit.id,stockItemId:stock.id,quantity:2,instructions:'Integration only'},user);
  await ops.dispense(rx.id,user);
  assert.equal((await db.stockItem.findUnique({where:{id:stock.id}})).quantity,8);
  await assert.rejects(ops.dispense(rx.id,user),{status:409});
  const invoice=await ops.invoice({visitId:visit.id,description:'Integration charge',amountCents:10000},user);
  const results=await Promise.allSettled([1,2].map(i=>ops.payment(invoice.id,{amountCents:7500,method:'CASH',reference:`integration-${randomUUID()}`},user)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1,'Only one concurrent payment may commit.');
  assert.equal((await db.payment.aggregate({where:{invoiceId:invoice.id},_sum:{amountCents:true}}))._sum.amountCents,7500);
  const audits=await db.auditLog.count({where:{userId:actor.id,action:'PAYMENT_RECORDED'}});assert.equal(audits,1,'Rejected payment must not add an audit entry.');
  await ops.payment(invoice.id,{amountCents:2500,method:'CASH',reference:`integration-${randomUUID()}`},user);
  await visits.updateStatus(visit.id,{status:'COMPLETED'},actor.id);await visits.updateStatus(visit.id,{status:'DISCHARGED'},actor.id);
  await assert.rejects(ops.care({visitId:visit.id,department:'CLINICAL',summary:'Closed',details:{}},user),{status:400});
  assert.equal((await visits.history(visit.id)).length,4);
 } finally {
  if(actor) await db.$transaction(async tx=>{
   if(visit) {
    await tx.payment.deleteMany({where:{invoice:{visitId:visit.id}}});await tx.invoice.deleteMany({where:{visitId:visit.id}});
    await tx.prescription.deleteMany({where:{visitId:visit.id}});await tx.labOrder.deleteMany({where:{visitId:visit.id}});await tx.careEntry.deleteMany({where:{visitId:visit.id}});await tx.workflowEvent.deleteMany({where:{visitId:visit.id}});await tx.visit.delete({where:{id:visit.id}});
   }
   if(stock) {await tx.stockMovement.deleteMany({where:{stockItemId:stock.id}});await tx.stockItem.delete({where:{id:stock.id}});}
   if(patient) await tx.patient.delete({where:{id:patient.id}});
   await tx.auditLog.deleteMany({where:{userId:actor.id}});await tx.user.delete({where:{id:actor.id}});
  });
  await db.$disconnect();
 }
});
