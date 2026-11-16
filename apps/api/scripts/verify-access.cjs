'use strict';
// Checks the running local API with temporary accounts and removes only its own records.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
require('dotenv').config({ path: resolve(__dirname, '../../../.env') });
const { PrismaClient } = require('@prisma/client');
const { JwtService } = require('@nestjs/jwt');
const { hash } = require('bcryptjs');
const db = new PrismaClient();
const jwt = new JwtService({ secret: process.env.JWT_SECRET });
const base = `http://localhost:${process.env.CMS_API_PORT || 3001}/api/v1`;
const users = [];
let patientId, visitId;
let checks = 0;
async function request(actor, method, path, status, body) {
  const response = await fetch(base + path, {
    method,
    headers: { Cookie: `cms_session=${actor.token}`, Origin: process.env.CMS_WEB_ORIGIN, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  assert.equal(response.status, status, `${actor.role} ${method} ${path}: ${JSON.stringify(result)}`);
  checks++;
  return result;
}
async function main() {
  try {
    const passwordHash = await hash(randomUUID(), 4);
    for (const role of ['SUPER_ADMIN', 'CLINIC_ADMIN', 'RECEPTIONIST', 'CLINICIAN_1', 'CLINICIAN_2', 'CLINICIAN_3']) {
      const user = await db.user.create({ data: { email: `permission-check-${randomUUID()}@example.test`, passwordHash, firstName: 'Permission', lastName: 'Check', role } });
      users.push({ ...user, token: jwt.sign({ sub: user.id }, { expiresIn: '5m' }) });
    }
    const [admin, clinicAdmin, reception, ...clinicians] = users;
    const areas = ['care', 'labs', 'stock', 'movements', 'prescriptions', 'invoices', 'appointments', 'expenses', 'staff', 'reports', 'audit'];
    for (const actor of [admin, clinicAdmin]) for (const area of areas) await request(actor, 'GET', `/operations/${area}`, 200);
    const filtered = await request(admin, 'GET', '/operations/reports?from=2026-11-16&to=2026-11-16&status=COMPLETED&department=CLINICAL&method=CASH', 200);
    assert.equal(filtered.filters.timezone, 'Africa/Nairobi');
    const period={gte:new Date('2026-11-15T21:00:00Z'),lt:new Date('2026-11-16T21:00:00Z')};
    assert.equal(filtered.patients,await db.patient.count({where:{createdAt:period}}));
    const invoices=await db.invoice.aggregate({_sum:{amountCents:true}});
    const payments=await db.payment.aggregate({_sum:{amountCents:true}});
    assert.equal(filtered.outstandingCents,(invoices._sum.amountCents??0)-(payments._sum.amountCents??0));
    const cash=await db.payment.aggregate({where:{createdAt:period,method:'CASH'},_sum:{amountCents:true}});
    assert.equal(filtered.collectedCents,cash._sum.amountCents??0);
    assert.ok(filtered.visits.every(v=>v.status==='COMPLETED'));
    assert.ok(filtered.departments.every(d=>d.department==='CLINICAL'));
    await request(admin, 'GET', '/operations/reports?from=2026-11-17&to=2026-11-16', 400);
    await request(admin, 'GET', '/operations/reports?from=2026-02-30', 400);
    await request(admin, 'GET', '/operations/reports?status=INVALID', 400);
    await request(admin, 'GET', '/operations/reports?method=INVALID', 400);
    const patient = await request(reception, 'POST', '/patients', 201, { firstName: 'Permission', lastName: 'Check' });
    patientId = patient.id;
    const visit = await request(reception, 'POST', '/visits', 201, { patientId, type: 'OUTPATIENT', reason: 'Temporary permission verification' });
    visitId = visit.id;
    await request(reception, 'GET', `/patients/${patientId}`, 200);
    await request(reception, 'GET', `/visits/${visitId}/history`, 200);
    await request(reception, 'POST', `/visits/${visitId}/status`, 403, { status: 'IN_PROGRESS' });
    for (const area of areas) await request(reception, 'GET', `/operations/${area}`, 403);
    await request(reception, 'POST', '/operations/invoices', 403, { visitId, description: 'Forbidden charge', amountCents: 100 });
    for (const department of ['TRIAGE', 'CLINICAL', 'RECOVERY', 'CATERING']) await request(admin, 'POST', '/operations/care', 201, { visitId, department, summary: 'Temporary permission check', details: {} });
    for (const actor of clinicians) {
      for (const area of ['care', 'labs', 'stock', 'movements', 'prescriptions']) await request(actor, 'GET', `/operations/${area}`, 200);
      for (const area of ['invoices', 'appointments', 'expenses', 'staff', 'reports', 'audit']) await request(actor, 'GET', `/operations/${area}`, 403);
      const notes = await request(actor, 'GET', '/operations/care', 200);
      assert.ok(notes.every(note => ['CLINICAL', 'RECOVERY'].includes(note.department)));
      assert.ok(notes.filter(note => note.visitId === visitId).length >= 2);
      await request(actor, 'POST', '/operations/care', 403, { visitId, department: 'RECOVERY', summary: 'Forbidden write', details: {} });
      await request(actor, 'POST', '/operations/care', 201, { visitId, department: 'CLINICAL', summary: 'Temporary clinical note', details: {} });
      await request(actor, 'POST', '/operations/stock', 403, { name: 'Forbidden stock', batch: randomUUID(), expiresAt: new Date(Date.now()+86400000).toISOString(), quantity: 1, reorderLevel: 1 });
    }
    await request(clinicAdmin, 'POST', `/operations/staff/${reception.id}/role`, 403, { role: 'CLINIC_ADMIN' });
    await request(admin, 'POST', `/operations/staff/${admin.id}/role`, 400, { role: 'RECEPTIONIST' });
    await request(admin, 'POST', `/operations/staff/${reception.id}/role`, 201, { role: 'CLINICIAN_3' });
    // Reuse the original session: authorization must use the account's current database role.
    await request(reception, 'GET', '/operations/movements', 200);
    await request(reception, 'POST', '/patients', 403, { firstName: 'Forbidden', lastName: 'Write' });
    console.log(`${checks} live permission checks passed, including role changes on existing sessions.`);
  } finally {
    const ids = users.map(user => user.id);
    if (ids.length) await db.$transaction(async tx => {
      if (visitId) {
        await tx.careEntry.deleteMany({ where: { visitId } });
        await tx.workflowEvent.deleteMany({ where: { visitId } });
        await tx.visit.delete({ where: { id: visitId } });
      }
      if (patientId) await tx.patient.delete({ where: { id: patientId } });
      await tx.auditLog.deleteMany({ where: { userId: { in: ids } } });
      await tx.user.deleteMany({ where: { id: { in: ids } } });
    });
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
