'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { canPerform, STAFF_ROLES } from '@cms/access';
import { AnimatedDialog, LoadingState } from '../components/motion';
import { api } from '../lib/api';
import RecordPicker from '../components/record-picker';

type Person = { id: string; patientNumber: string; firstName: string; lastName: string };
type Employee = { id: string; firstName: string; lastName: string; email: string; role: string; active: boolean };
type LoginDetails = { email: string; password: string; role: string };
const roleNames: Record<string, string> = {
  SUPER_ADMIN: 'Full administrator', CLINIC_ADMIN: 'Administrator', RECEPTIONIST: 'Receptionist', CASHIER: 'Cashier',
  ATTENDANT: 'Attendant / triage', PHARMACIST: 'Pharmacist', LAB_TECHNICIAN: 'Laboratory technician',
  CLINICIAN_1: 'Clinician 1', CLINICIAN_2: 'Clinician 2', CLINICIAN_3: 'Clinician 3', RECOVERY_NURSE: 'Recovery nurse',
  CATERING_STAFF: 'Catering staff', ACCOUNTANT: 'Accountant', PROCUREMENT_OFFICER: 'Procurement officer', PATIENT: 'Patient portal account',
};
const roleHelp: Record<string, string> = {
  RECEPTIONIST: 'Register patients, open visits, and view existing records. Existing records and visit status cannot be changed.',
  CLINICIAN_1: 'Clinical records, laboratory, pharmacy stock, stock usage history, and recovery. Prescribing is inside Clinical records.',
  CLINICIAN_2: 'Clinical records, laboratory, pharmacy stock, stock usage history, and recovery. Prescribing is inside Clinical records.',
  CLINICIAN_3: 'Clinical records, laboratory, pharmacy stock, stock usage history, and recovery. Prescribing is inside Clinical records.',
  ACCOUNTANT: 'Billing records, recorded payments, expenses, and management reports.',
  CASHIER: 'Create visit charges and record payments.', PHARMACIST: 'Manage medicine stock, inspect usage, and dispense prescriptions.',
  LAB_TECHNICIAN: 'View requested tests and record final laboratory results.', ATTENDANT: 'Record triage assessments and vital signs.',
  RECOVERY_NURSE: 'View triage and clinical records and record recovery care.', CATERING_STAFF: 'View and record catering care.',
  PROCUREMENT_OFFICER: 'Receive medicine batches, adjust stock, and inspect stock usage.',
  CLINIC_ADMIN: 'Access all clinic departments, reports, and employee administration.',
  PATIENT: 'Access only the linked patient’s own portal records.',
};
function generatePassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_');
}

export default function Employees({ role, userId, patients }: { role: string; userId: string; patients: Person[] }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedRole, setSelectedRole] = useState('RECEPTIONIST');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [details, setDetails] = useState<LoginDetails | null>(null);
  const [revealDetails, setRevealDetails] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editor, setEditor] = useState<{employee:Employee;mode:'edit'|'password'|'delete'}|null>(null);
  const [editorError, setEditorError] = useState('');
  const [editorPassword, setEditorPassword] = useState('');
  const [editorConfirmation, setEditorConfirmation] = useState('');
  const [editorShow, setEditorShow] = useState(false);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const assignable = STAFF_ROLES.filter(value => role === 'SUPER_ADMIN' || value !== 'CLINIC_ADMIN');

  const load = useCallback(async () => {
    if (!canPerform(role, 'staff.read')) return;
    setLoading(true);
    try { setEmployees(await api<Employee[]>('/operations/staff')); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load employees.'); }
    finally { setLoading(false); }
  }, [role]);
  useEffect(() => { void load(); }, [load]);

  async function createEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError(''); setNotice('');
    if (password !== confirmation) { setError('Passwords do not match.'); return; }
    if (password.length < 14 || new TextEncoder().encode(password).length > 72) { setError('Use at least 14 characters and no more than 72 UTF-8 bytes.'); return; }
    const email = String(data.get('email')).trim().toLowerCase();
    setBusy(true);
    try {
      await api('/operations/staff', { method: 'POST', body: JSON.stringify({
        firstName: data.get('firstName'), lastName: data.get('lastName'), email, password, role: selectedRole,
        ...(selectedRole === 'PATIENT' ? { patientId: data.get('patientId') } : {}),
      }) });
      setDetails({ email, password, role: selectedRole }); setRevealDetails(false);
      form.reset(); setPassword(''); setConfirmation(''); setShowPassword(false);
      setSelectedRole('RECEPTIONIST');
      await load();
      setNotice(`Account created for ${email}. Share the login details below with the account holder.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create employee.'); }
    finally { setBusy(false); }
  }
  async function updateEmployee(path: string, body: object, message: string) {
    setBusy(true); setError(''); setNotice('');
    try { await api(path, { method: 'POST', body: JSON.stringify(body) }); setDeactivateId(null); await load(); setNotice(message); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update employee.'); }
    finally { setBusy(false); }
  }
  function openEditor(employee: Employee, mode: 'edit'|'password'|'delete') {
    setEditor({employee,mode});setEditorError('');setEditorPassword('');setEditorConfirmation('');setEditorShow(false);
  }
  async function saveEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();if (!editor) return;
    const form=new FormData(event.currentTarget);const {employee,mode}=editor;setEditorError('');
    if (mode==='password' && (editorPassword!==editorConfirmation || editorPassword.length<14 || new TextEncoder().encode(editorPassword).length>72)) {setEditorError('Passwords must match, contain at least 14 characters, and fit within 72 UTF-8 bytes.');return;}
    if (mode==='delete' && String(form.get('confirmEmail')).trim().toLowerCase()!==employee.email.toLowerCase()) {setEditorError('Enter the employee email exactly to confirm deletion.');return;}
    setBusy(true);setError('');setNotice('');
    try {
      const path='/operations/staff/'+employee.id+(mode==='password'?'/password':'');
      const body=mode==='edit'?{firstName:form.get('firstName'),lastName:form.get('lastName'),email:form.get('email')}:mode==='password'?{password:editorPassword}:undefined;
      const result=await api<{email?:string;role?:string;message?:string}>(path,{method:mode==='edit'?'PATCH':mode==='delete'?'DELETE':'POST',...(body?{body:JSON.stringify(body)}:{})});
      if (mode==='password') {setDetails({email:result.email??employee.email,role:result.role??employee.role,password:editorPassword});setRevealDetails(false);}
      else if (details?.email===employee.email) setDetails(null);
      setEditor(null);setEditorPassword('');setEditorConfirmation('');await load();
      setNotice(mode==='edit'?'Employee name and email updated.':mode==='password'?'Password updated. Previous sessions have been signed out. Share the new login details below.':result.message??'Employee removed.');
    } catch(e) {setEditorError(e instanceof Error?e.message:'Unable to update employee.');}
    finally {setBusy(false);}
  }
  async function copyDetails() {
    if (!details) return;
    try {
      await navigator.clipboard.writeText(`Clinic login\n${window.location.origin}\nEmail: ${details.email}\nPassword: ${details.password}\nRole: ${roleNames[details.role]}`);
      setNotice('Login details copied. Share them directly with the account holder.');
    } catch { setError('Clipboard access is unavailable. Reveal the password and copy the details manually.'); }
  }
  const canManage = (employee: Employee) => employee.id !== userId && employee.role !== 'SUPER_ADMIN' && (role === 'SUPER_ADMIN' || employee.role !== 'CLINIC_ADMIN');
  const visible = employees.filter(employee => {
    const term = search.trim().toLowerCase();
    return (roleFilter ? employee.role === roleFilter : employee.role !== 'PATIENT') &&
      (!statusFilter || employee.active === (statusFilter === 'active')) &&
      `${employee.firstName} ${employee.lastName} ${employee.email}`.toLowerCase().includes(term);
  });
  if (!canPerform(role, 'staff.create')) return <p className="alert error">Employee administration is restricted to administrators.</p>;

  return <section className="employees-page motion-page" aria-label="Employee administration">
    <div className="panel-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1>Employees & accounts</h1><p className="subtle">Add your team, choose their department, and give each person their own login.</p></div><button className="quiet-button" disabled={loading || busy} onClick={() => {setError('');void load();}}>Refresh list</button></div>
    {error && <p className="alert error" role="alert">{error}</p>}{notice && <p className="alert success" role="status">{notice}</p>}
    {details && <section className="panel employee-login-details" aria-label="New account login details">
      <div className="panel-heading"><h2>Account ready to use</h2><button className="quiet-button" onClick={() => {setDetails(null);setRevealDetails(false);}}>Dismiss details</button></div>
      <p>{roleNames[details.role]} · <strong>{details.email}</strong></p>
      <div className="employee-password"><label>Assigned password<input readOnly type={revealDetails ? 'text' : 'password'} value={details.password} autoComplete="off" aria-label="New account password"/></label><button type="button" className="quiet-button" aria-pressed={revealDetails} onClick={() => setRevealDetails(!revealDetails)}>{revealDetails ? 'Hide' : 'Show'}</button><button type="button" className="quiet-button" onClick={() => void copyDetails()}>Copy login details</button></div>
      <p className="subtle">Share these details before dismissing this card. Existing passwords cannot be viewed in the employee list.</p>
    </section>}
    <div className="employee-setup-grid">
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">NEW TEAM MEMBER</p><h2>{selectedRole === 'PATIENT' ? 'Create patient portal account' : 'Add an employee'}</h2></div><span className="panel-symbol" aria-hidden="true">＋</span></div>
        <form className="form-grid" onSubmit={createEmployee}>
          <label>First name<input name="firstName" required maxLength={80} autoComplete="given-name"/></label>
          <label>Last name<input name="lastName" required maxLength={80} autoComplete="family-name"/></label>
          <label className="full">Login email<input name="email" type="email" required maxLength={254} autoComplete="off"/></label>
          <label className="full">Role / department<select value={selectedRole} onChange={e=>setSelectedRole(e.target.value)}>{[...assignable,'PATIENT'].map(value=><option value={value} key={value}>{roleNames[value]}</option>)}</select></label>
          <p className="employee-role-help full">{roleHelp[selectedRole]}</p>
          {selectedRole === 'PATIENT' && <RecordPicker kind="patients" name="patientId" label="Patient record"/>}
          <label className="full">Set login password<input type={showPassword ? 'text' : 'password'} value={password} onChange={e=>setPassword(e.target.value)} required minLength={14} maxLength={72} autoComplete="new-password" aria-describedby="employee-password-help"/></label>
          <div className="employee-password-tools full"><button type="button" className="quiet-button" onClick={()=>{const value=generatePassword();setPassword(value);setConfirmation(value);}}>Generate password</button><button type="button" className="quiet-button" aria-pressed={showPassword} onClick={()=>setShowPassword(!showPassword)}>{showPassword ? 'Hide password' : 'Show password'}</button></div>
          <label className="full">Confirm password<input type={showPassword ? 'text' : 'password'} value={confirmation} onChange={e=>setConfirmation(e.target.value)} required minLength={14} maxLength={72} autoComplete="new-password"/></label>
          <p className="subtle full" id="employee-password-help">Use at least 14 characters. You can enter your own password or generate one.</p>
          <button className="wide-button" disabled={busy} aria-busy={busy}>{busy ? 'Creating account…' : selectedRole === 'PATIENT' ? 'Create patient login' : 'Create employee login'}</button>
        </form>
      </section>
      <aside className="panel employee-help"><p className="eyebrow">HOW IT WORKS</p><h2>One account per person</h2><ol><li>Enter the employee’s name and email.</li><li>Choose their role, including Clinician 1, 2, or 3.</li><li>Set or generate a password, then create the login.</li><li>Copy the login details and share them with the employee.</li></ol><p className="subtle">Employees use the same sign-in page. Their assigned role controls the screens and actions available to them.</p><p className="subtle">Passwords are stored as hashes and are never listed alongside existing accounts.</p></aside>
    </div>
    <section className="panel employee-directory"><div className="panel-heading"><div><p className="eyebrow">YOUR TEAM</p><h2>Employee directory</h2></div><span className="today-pill">{visible.length} shown</span></div>
      <div className="employee-directory-filters"><label>Search employees<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name or email"/></label><label>Role<select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}><option value="">All employees</option>{['SUPER_ADMIN',...STAFF_ROLES,'PATIENT'].map(value=><option key={value} value={value}>{roleNames[value]}</option>)}</select></label><label>Status<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div>
      {loading ? <LoadingState label="Loading employee accounts…"/> : <div className="record-list">{visible.map(employee=><article className="employee-card" key={employee.id}>
        <div className="employee-card-heading"><div><h3>{employee.firstName} {employee.lastName}{employee.id===userId && <small> (you)</small>}</h3><p>{employee.email}</p></div><span className={`status ${employee.active?'completed':'cancelled'}`}>{employee.active?'Active':'Inactive'}</span></div>
        <p className="employee-role-label">{roleNames[employee.role] ?? employee.role}</p>
        {canManage(employee) && <div className="employee-actions"><div className="employee-management-buttons"><button className="quiet-button" disabled={busy} onClick={()=>openEditor(employee,'edit')}>Edit details</button><button className="quiet-button" disabled={busy} onClick={()=>openEditor(employee,'password')}>Reset password</button><button className="quiet-button danger-button" disabled={busy} onClick={()=>openEditor(employee,'delete')}>Delete account</button>{!employee.active && <button className="quiet-button" disabled={busy} onClick={()=>void updateEmployee(`/operations/staff/${employee.id}/reactivate`,{},'Employee account reactivated. They can sign in with their current password.')}>Reactivate</button>}</div>
          {employee.role!=='PATIENT' && <form className="inline-form" onSubmit={event=>{event.preventDefault();const value=new FormData(event.currentTarget).get('role');void updateEmployee(`/operations/staff/${employee.id}/role`,{role:value},'Employee role updated.');}}><label>Assigned role<select name="role" defaultValue={employee.role} key={employee.role}>{assignable.map(value=><option key={value} value={value}>{roleNames[value]}</option>)}</select></label><button className="quiet-button" disabled={busy}>Save role</button></form>}
          {employee.active && (deactivateId===employee.id ? <div className="employee-deactivate"><span>Block this account from signing in?</span><button className="quiet-button" disabled={busy} onClick={()=>void updateEmployee(`/operations/staff/${employee.id}/deactivate`,{},'Employee account deactivated.')}>Confirm deactivation</button><button className="quiet-button" disabled={busy} onClick={()=>setDeactivateId(null)}>Cancel</button></div> : <button className="quiet-button" disabled={busy} onClick={()=>setDeactivateId(employee.id)}>Deactivate</button>)}
        </div>}
      </article>)}{visible.length===0 && <p className="empty">No matching accounts. Add an employee using the form above.</p>}</div>}
    </section>
﻿    {editor && <AnimatedDialog title={editor.mode==='edit'?'Edit employee':editor.mode==='password'?'Reset employee password':'Delete employee account'} closeLabel="Close" dismissible={!busy} onClose={()=>{setEditor(null);setEditorPassword('');setEditorConfirmation('');}}>
      <h2>{editor.mode==='edit'?'Edit employee details':editor.mode==='password'?'Reset password':'Delete account'}</h2>
      <p className="subtle">{editor.employee.firstName} {editor.employee.lastName} · {editor.employee.email}</p>
      {editorError && <p className="alert error" role="alert">{editorError}</p>}
      <form className="form-stack employee-editor" onSubmit={saveEditor}>
        {editor.mode==='edit' && <><label>First name<input name="firstName" defaultValue={editor.employee.firstName} required maxLength={80}/></label><label>Last name<input name="lastName" defaultValue={editor.employee.lastName} required maxLength={80}/></label><label>Login email<input name="email" type="email" defaultValue={editor.employee.email} required maxLength={254}/></label></>}
        {editor.mode==='password' && <><p className="subtle">Resetting the password signs out this employee’s previous sessions.</p><label>New password<input type={editorShow?'text':'password'} value={editorPassword} onChange={e=>setEditorPassword(e.target.value)} required minLength={14} maxLength={72} autoComplete="new-password"/></label><label>Confirm new password<input type={editorShow?'text':'password'} value={editorConfirmation} onChange={e=>setEditorConfirmation(e.target.value)} required minLength={14} maxLength={72} autoComplete="new-password"/></label><div className="employee-password-tools"><button type="button" className="quiet-button" onClick={()=>{const value=generatePassword();setEditorPassword(value);setEditorConfirmation(value);}}>Generate password</button><button type="button" className="quiet-button" aria-pressed={editorShow} onClick={()=>setEditorShow(!editorShow)}>{editorShow?'Hide password':'Show password'}</button></div></>}
        {editor.mode==='delete' && <><p className="alert error">Unused accounts are permanently deleted. Accounts with clinic activity are deactivated and their history is preserved.</p><label>Type {editor.employee.email} to confirm<input name="confirmEmail" type="email" required autoComplete="off"/></label></>}
        <button className={`wide-button${editor.mode==='delete'?' danger-button':''}`} disabled={busy} aria-busy={busy}>{busy?'Saving…':editor.mode==='edit'?'Save employee details':editor.mode==='password'?'Set new password':'Confirm removal'}</button>
      </form>
    </AnimatedDialog>}
  </section>;
}
