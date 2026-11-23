'use strict';
const ADMIN_ROLES = ['SUPER_ADMIN', 'CLINIC_ADMIN'];
const CLINICIAN_ROLES = ['CLINICIAN_1', 'CLINICIAN_2', 'CLINICIAN_3'];
const STAFF_ROLES = ['RECEPTIONIST', 'CLINIC_ADMIN', 'CASHIER', 'ATTENDANT', 'PHARMACIST', 'LAB_TECHNICIAN', ...CLINICIAN_ROLES, 'RECOVERY_NURSE', 'CATERING_STAFF', 'ACCOUNTANT', 'PROCUREMENT_OFFICER'];
const MODULES = ['triage', 'clinical', 'labs', 'stock', 'movements', 'prescriptions', 'invoices', 'recovery', 'catering', 'appointments', 'expenses', 'staff', 'reports', 'audit', 'inpatient'];
const roleModules = {
  RECEPTIONIST: [],
  CASHIER: ['invoices'],
  ATTENDANT: ['triage'],
  PHARMACIST: ['stock', 'movements', 'prescriptions'],
  LAB_TECHNICIAN: ['labs'],
  RECOVERY_NURSE: ['triage', 'clinical', 'recovery', 'inpatient'],
  CATERING_STAFF: ['catering'],
  ACCOUNTANT: ['invoices', 'expenses', 'reports'],
  PROCUREMENT_OFFICER: ['stock', 'movements'],
};
for (const role of CLINICIAN_ROLES) roleModules[role] = ['clinical', 'triage', 'labs', 'stock', 'movements', 'recovery', 'inpatient'];
const patientReaders = ['RECEPTIONIST', 'ATTENDANT', 'PHARMACIST', 'LAB_TECHNICIAN', ...CLINICIAN_ROLES, 'RECOVERY_NURSE'];
const workflowWriters = ['ATTENDANT', ...CLINICIAN_ROLES, 'RECOVERY_NURSE'];
const actions = {
  'patients.read': patientReaders,
  'patients.create': ['RECEPTIONIST'],
  'patients.update': ['RECEPTIONIST'],
  'patients.delete': [],
  'visits.read': [...patientReaders, 'CATERING_STAFF', 'CASHIER', 'ACCOUNTANT'],
  'visits.create': ['RECEPTIONIST'],
  'visits.history': ['RECEPTIONIST', ...workflowWriters],
  'visits.status': workflowWriters,
  'care.read': ['ATTENDANT', ...CLINICIAN_ROLES, 'RECOVERY_NURSE', 'CATERING_STAFF'],
  'care.triage': ['ATTENDANT'],
  'care.clinical': CLINICIAN_ROLES,
  'care.recovery': ['RECOVERY_NURSE'],
  'care.catering': ['CATERING_STAFF'],
  'labs.read': ['LAB_TECHNICIAN', ...CLINICIAN_ROLES],
  'labs.create': CLINICIAN_ROLES,
  'labs.result': ['LAB_TECHNICIAN'],
  'stock.read': ['PHARMACIST', 'PROCUREMENT_OFFICER', ...CLINICIAN_ROLES],
  'stock.create': ['PHARMACIST', 'PROCUREMENT_OFFICER'],
  'stock.adjust': ['PHARMACIST', 'PROCUREMENT_OFFICER'],
  'movements.read': ['PHARMACIST', 'PROCUREMENT_OFFICER', ...CLINICIAN_ROLES],
  // Prescribing is part of Clinical records for clinicians, a separate queue for pharmacy.
  'prescriptions.read': ['PHARMACIST', ...CLINICIAN_ROLES],
  'prescriptions.create': CLINICIAN_ROLES,
  'prescriptions.dispense': ['PHARMACIST'],
  'invoices.read': ['CASHIER', 'ACCOUNTANT'],
  'invoices.create': ['CASHIER'],
  'invoices.payment': ['CASHIER', 'ACCOUNTANT'],
  'appointments.read': [],
  'appointments.create': [],
  'appointments.update': [],
  'expenses.read': ['ACCOUNTANT'],
  'expenses.create': ['ACCOUNTANT'],
  'staff.read': [],
  'staff.create': [],
  'staff.update': [],
  'reports.read': ['ACCOUNTANT'],
  'audit.read': [],
};
function rolesFor(action) {
  return Object.prototype.hasOwnProperty.call(actions, action) ? [...ADMIN_ROLES, ...actions[action]] : [];
}
function canPerform(role, action) { return rolesFor(action).includes(role); }
function modulesFor(role) { return ADMIN_ROLES.includes(role) ? [...MODULES] : [...(Object.prototype.hasOwnProperty.call(roleModules, role) ? roleModules[role] : [])]; }
function canAccessModule(role, key) { return modulesFor(role).includes(key); }
function careDepartmentsFor(role) {
  return ['TRIAGE', 'CLINICAL', 'RECOVERY', 'CATERING'].filter(department => canAccessModule(role, department.toLowerCase()));
}
function visitTransitionsFor(role, from) {
  const transitions = {
    REGISTERED: ['WAITING', 'IN_PROGRESS', 'ADMITTED', 'CANCELLED'],
    WAITING: ['IN_PROGRESS', 'REFERRED', 'ADMITTED', 'CANCELLED'],
    IN_PROGRESS: ['WAITING', 'REFERRED', 'ADMITTED', 'UNDER_OBSERVATION', 'COMPLETED', 'DISCHARGED'],
    REFERRED: ['WAITING', 'IN_PROGRESS', 'ADMITTED', 'CANCELLED'],
    ADMITTED: ['IN_PROGRESS', 'UNDER_OBSERVATION', 'COMPLETED', 'DISCHARGED'],
    UNDER_OBSERVATION: ['IN_PROGRESS', 'COMPLETED', 'DISCHARGED'],
    COMPLETED: ['DISCHARGED'], DISCHARGED: [], CANCELLED: [],
  };
  const available = transitions[from] || [];
  if (ADMIN_ROLES.includes(role) || CLINICIAN_ROLES.includes(role)) return [...available];
  if (role === 'ATTENDANT') return available.filter(s => ['WAITING', 'IN_PROGRESS'].includes(s));
  if (role === 'RECOVERY_NURSE') return available.filter(s => ['IN_PROGRESS', 'UNDER_OBSERVATION'].includes(s));
  return [];
}
exports.ADMIN_ROLES = Object.freeze(ADMIN_ROLES);
exports.CLINICIAN_ROLES = Object.freeze(CLINICIAN_ROLES);
exports.STAFF_ROLES = Object.freeze(STAFF_ROLES);
exports.rolesFor = rolesFor;
exports.canPerform = canPerform;
exports.modulesFor = modulesFor;
exports.canAccessModule = canAccessModule;
exports.careDepartmentsFor = careDepartmentsFor;
exports.visitTransitionsFor = visitTransitionsFor;
