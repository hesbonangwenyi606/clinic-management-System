'use client';

import { useState, FormEvent } from 'react';
import { canPerform } from '@cms/access';
import EncounterChart from './encounter-chart';
import { PatientAllergyInput, PatientDigitsInput, PatientNameInput, readPatientAllergies } from './patient-inputs';
import { api } from '../lib/api';
import { AnimatedDialog, LoadingState } from '../components/motion';

type RecordData = {
  patientNumber: string; firstName: string; lastName: string; gender: string; updatedAt:string;
  age?: number | null; dateOfBirth?: string | null; phone?: string | null; email?: string | null;
  address?: string | null; emergencyContact?: string | null; nextOfKin?: string | null;
  allergies?: string | null; medicalAlerts?: string | null; archivedAt?: string | null;
  visits: {id: string; visitNumber: string; status: string; reason: string; archivedAt?: string | null; amountPaidCents?: number}[];
};

const visitCurrency = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' });

function ageFromDateOfBirth(dateOfBirth?: string | null) {
  if (!dateOfBirth) return null;
  const birthDate = dateOfBirth.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const age = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4))
    - Number(today.slice(5) < birthDate.slice(5));
  return age >= 0 && age <= 999 ? age : null;
}

export default function PatientChart({id, role, onChanged}: {id: string; role: string; onChanged: () => Promise<void>}) {
  const [patient, setPatient] = useState<RecordData | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const age = patient?.age ?? ageFromDateOfBirth(patient?.dateOfBirth);
  const details: [string, string | null | undefined][] = patient ? [
    ['Name', `${patient.firstName} ${patient.lastName}`],
    ['Patient number', patient.patientNumber],
    ['Age', age?.toString()],
    ['Gender', patient.gender === 'NOT_SPECIFIED' ? null : patient.gender.replaceAll('_', ' ')],
    ['Phone', patient.phone], ['Email', patient.email], ['Address', patient.address],
    ['Emergency contact', patient.emergencyContact], ['Next of kin', patient.nextOfKin],
    ['Allergies', patient.allergies], ['Medical alerts', patient.medicalAlerts],
  ] : [];
  async function load() {
    setOpen(true); setPatient(null); setMode('view'); setError(''); setNotice('');
    try { setPatient(await api<RecordData>('/patients/'+id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load patient.'); }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget); setBusy(true); setError('');
    const body = Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, value === '' ? null : value]));
    delete body.allergyChoice;
    delete body.allergyDetails;
    body.allergies = readPatientAllergies(form);
    const enteredAge = body.age === null ? null : Number(body.age);
    delete body.age;
    for (const field of ['firstName', 'lastName', 'emergencyContact'] as const) {
      if ((body[field] ?? null) === (patient?.[field] ?? null)) delete body[field];
    }
    const ageUpdate = enteredAge === (patient?.age ?? null) ? {} : { age: enteredAge };
    try {
      await api('/patients/'+id, {method:'PATCH', body:JSON.stringify({...body,...ageUpdate,expectedUpdatedAt:patient?.updatedAt})});
      setPatient(await api<RecordData>('/patients/'+id)); setMode('view'); setNotice('Patient details updated.'); await onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update patient.'); }
    finally { setBusy(false); }
  }
  async function remove(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('');
    try { const result = await api<{message:string}>('/patients/'+id, {method:'DELETE'}); setNotice(result.message); setOpen(false); await onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete patient.'); }
    finally { setBusy(false); }
  }
  return <><button type="button" className="quiet-button" onClick={load}>View record</button>
    {notice && !open && <span role="status">{notice}</span>}
    {open && <AnimatedDialog title={mode === 'edit' ? 'Edit patient' : mode === 'delete' ? 'Delete patient' : 'Patient record'} dismissible={!busy} onClose={() => setOpen(false)}>
      {error && <p className="alert error" role="alert">{error}</p>}
      {notice && <p className="alert" role="status">{notice}</p>}
      {!patient ? !error && <LoadingState label="Loading patient record…" /> : <>
        <div className="record-header"><h2>Patient record</h2>{patient.archivedAt && <p className="record-number">Archived</p>}</div>
        {mode === 'view' && <>
          <section className="record-section"><h3>Details</h3><div className="record-table record-details-table"><table><tbody>
            {details.filter(([, value]) => value?.trim()).map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}
          </tbody></table></div></section>
          {!patient.archivedAt && <div className="patient-actions">
            {canPerform(role,'patients.update') && <button className="quiet-button" onClick={() => {setMode('edit');setNotice('');}}>Edit patient</button>}
            {canPerform(role,'patients.delete') && <button className="quiet-button danger-button" onClick={() => {setMode('delete');setNotice('');}}>Delete patient</button>}
          </div>}
          <section className="record-section"><h3>Visits <span className="record-count">{patient.visits.length}</span></h3>
            {patient.visits.length ? <div className="table-wrap record-table"><table><thead><tr><th scope="col">Visit</th><th scope="col">Status</th><th scope="col">Reason</th>{canPerform(role, 'invoices.read') && <th scope="col">Amount paid</th>}<th scope="col">Chart</th></tr></thead><tbody>{patient.visits.map(v => <tr key={v.id}><td><strong>{v.visitNumber}</strong></td><td><span className={`status ${v.status.toLowerCase()}`}>{v.status.replaceAll('_',' ')}</span>{v.archivedAt && <small>Archived</small>}</td><td>{v.reason || 'Not recorded'}</td>{canPerform(role, 'invoices.read') && <td>{v.amountPaidCents === undefined ? '—' : visitCurrency.format(v.amountPaidCents / 100)}</td>}<td><EncounterChart id={v.id}/></td></tr>)}</tbody></table></div> : <p className="record-empty">No visits yet.</p>}
          </section>
        </>}
        {mode === 'edit' && <form className="form-grid" onSubmit={save}>
          <label>First name<PatientNameInput name="firstName" defaultValue={patient.firstName} required /></label>
          <label>Last name<PatientNameInput name="lastName" defaultValue={patient.lastName} required /></label>
          <label>Age<PatientDigitsInput name="age" defaultValue={patient.age ?? ''} placeholder={age?.toString()} /></label>
          <label>Gender<select name="gender" defaultValue={patient.gender}>{['NOT_SPECIFIED','MALE','FEMALE','OTHER'].map(g => <option key={g} value={g}>{g.replaceAll('_',' ')}</option>)}</select></label>
          <label>Phone<input name="phone" defaultValue={patient.phone || ''} maxLength={30}/></label>
          <label>Email<input name="email" type="email" defaultValue={patient.email || ''} maxLength={254}/></label>
          <label className="full">Address<input name="address" defaultValue={patient.address || ''} maxLength={500}/></label>
          <label>Emergency contact<PatientDigitsInput name="emergencyContact" defaultValue={patient.emergencyContact || ''} /></label>
          <label>Next of kin<input name="nextOfKin" defaultValue={patient.nextOfKin || ''} maxLength={200}/></label>
          <PatientAllergyInput value={patient.allergies} />
          <label className="full">Medical alerts<textarea name="medicalAlerts" defaultValue={patient.medicalAlerts || ''} maxLength={2000}/></label>
          <button className="wide-button" disabled={busy}>{busy ? 'Saving…' : 'Save patient'}</button>
          <button type="button" className="quiet-button" disabled={busy} onClick={() => setMode('view')}>Cancel</button>
        </form>}
        {mode === 'delete' && <form onSubmit={remove}>
          <p>This removes the patient from the active directory. Records with visits, appointments, or a portal account are archived to preserve history. Portal access will be disabled. Patients without these links are permanently deleted.</p>
          <label>Enter {patient.patientNumber} to confirm<input required autoComplete="off" pattern={patient.patientNumber} aria-label="Confirm patient number"/></label>
          <div className="patient-actions"><button className="quiet-button danger-button" disabled={busy}>{busy ? 'Removing…' : 'Confirm deletion'}</button><button type="button" className="quiet-button" disabled={busy} onClick={() => setMode('view')}>Cancel</button></div>
        </form>}
      </>}
    </AnimatedDialog>}
  </>;
}
