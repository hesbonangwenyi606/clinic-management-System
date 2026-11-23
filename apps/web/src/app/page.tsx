'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

import { canPerform, modulesFor, visitTransitionsFor } from '@cms/access';
import { LoadingState } from '../components/motion';
import PatientChart from './patient-record';
import Account from './account';
import RecordPicker from '../components/record-picker';

import { api, ApiError } from '../lib/api';

const Operations = dynamic(() => import('./operations'), { loading: () => <LoadingState label="Loading departments…" /> });
const Reports = dynamic(() => import('./reports'), { loading: () => <LoadingState label="Loading reports…" /> });
const Employees = dynamic(() => import('./employees'), { loading: () => <LoadingState label="Loading employees…" /> });
const Portal = dynamic(() => import('./portal'), { loading: () => <LoadingState label="Loading your clinic record…" /> });

type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
};

type Patient = {
  id: string;
  patientNumber: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  createdAt: string;
};

type Visit = {
  id: string;
  visitNumber: string;
  type: string;
  status: string;
  reason: string;
  arrivedAt: string;
  patient: Pick<Patient, 'patientNumber' | 'firstName' | 'lastName' | 'phone'>;
};

export default function Home() {
  const roleRef = useRef('');
  const refreshRequest = useRef(0);
  const [tab, setTab] = useState('desk');
  const [reportsOpened, setReportsOpened] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page,setPage] = useState(1);
  const [patientPage,setPatientPage] = useState(1);
  const [patientTotal,setPatientTotal] = useState(0);
  const [summary,setSummary] = useState({active:0,waiting:0});

  const refresh = useCallback(async (search = '') => {
    const request = ++refreshRequest.current;
    const [patientResult, visitResult, totals] = await Promise.all([
      canPerform(roleRef.current,'patients.read') ? api<{ items: Patient[]; total: number }>(`/patients?search=${encodeURIComponent(search)}&pageSize=50&page=${patientPage}`) : Promise.resolve({items:[],total:0}),
      canPerform(roleRef.current,'visits.read') ? api<Visit[]>(`/visits?search=${encodeURIComponent(search)}&pageSize=50&page=${page}`) : Promise.resolve([]),
      canPerform(roleRef.current,'visits.read') ? api<{active:number;waiting:number}>('/visits/summary') : Promise.resolve({active:0,waiting:0}),
    ]);
    if (request !== refreshRequest.current) return;
    setPatients(patientResult.items);
    setVisits(visitResult);
    setPatientTotal(patientResult.total);
    setSummary(totals);
  }, [page,patientPage]);

  useEffect(() => {
    const expired = () => {
      refreshRequest.current++; roleRef.current='';setUser(null);setPatients([]);setVisits([]);setTab('desk');setNotice('');setError('Your session ended. Please sign in again.');
    };
    window.addEventListener('cms:session-expired',expired);
    return () => window.removeEventListener('cms:session-expired',expired);
  },[]);

  useEffect(() => {
    if (!user) return;
    const timeout = window.setTimeout(()=>void refresh(query).catch(e=>setError(e.message)),query ? 300 : 0);
    return () => window.clearTimeout(timeout);
  },[query,refresh,user]);

  useEffect(() => {
    api<User>('/auth/me')
      .then((activeUser) => {
        roleRef.current = activeUser.role;
        setUser(activeUser);
        if (activeUser.role.startsWith('CLINICIAN')) setTab('departments');
      })
      .catch((reason: unknown) => {
        setUser(null);
        if (!(reason instanceof ApiError) || reason.status !== 401) {
          setError(reason instanceof Error ? reason.message : 'Unable to connect to the clinic API.');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
        }),
      });
      roleRef.current = result.user.role;
      setUser(result.user);
      setTab(result.user.role.startsWith('CLINICIAN') ? 'departments' : 'desk');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setError('');
    try {
      await api('/auth/logout', { method: 'POST' });
      refreshRequest.current++;
      setUser(null);
      setTab('desk');
      setPatients([]);
      setVisits([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign out.');
    } finally {
      refreshRequest.current++;roleRef.current='';setUser(null);setPatients([]);setVisits([]);setTab('desk');setNotice('');
    }
  }

  async function createPatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api<Patient>('/patients', {
        method: 'POST',
        body: JSON.stringify({
          firstName: form.get('firstName'),
          lastName: form.get('lastName'),
          phone: form.get('phone') || undefined,
          gender: form.get('gender'),
          dateOfBirth: form.get('dateOfBirth') || undefined,
          allergies: form.get('allergies') || undefined,
          medicalAlerts: form.get('medicalAlerts') || undefined,
          emergencyContact: form.get('emergencyContact') || undefined,
          nextOfKin: form.get('nextOfKin') || undefined,
        }),
      });
      formElement.reset();
      await refresh(query);
      setNotice('Patient registered.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to register patient.');
    } finally {
      setBusy(false);
    }
  }

  async function createVisit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/visits', {
        method: 'POST',
        body: JSON.stringify({
          patientId: form.get('patientId'),
          type: form.get('type'),
          reason: form.get('reason'),
        }),
      });
      formElement.reset();
      await refresh(query);
      setNotice('Visit opened and added to the workflow.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to open visit.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="loading"><LoadingState /></main>;

  if (!user) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand-icon" aria-hidden="true">+</div>
          <p className="eyebrow">CLINIC MANAGEMENT SYSTEM</p>
          <h1>Welcome back</h1>
          <p className="subtle">Sign in with your clinic account to continue.</p>
          <form onSubmit={signIn} className="form-stack">
            <label>Email address<input name="email" type="email" autoComplete="username" required /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
            {error && <p className="alert error">{error}</p>}
            <button disabled={busy} aria-busy={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <p className="login-footnote">Accounts are provisioned by your clinic administrator.</p>
        </section>
      </main>
    );
  }

  if (user.role === 'PATIENT') return <Portal onSignOut={signOut} />;
  const canRegister = canPerform(user.role,'patients.create');
  const hasDepartments = modulesFor(user.role).length > 0;
  const canWorkflow = canPerform(user.role,'visits.status');
  const visibleVisits = visits;
  return (
    <main className="workspace">
      <header className="topbar">
        <div className="brand-line"><div className="brand-icon small">+</div><div><strong>Clinic CMS</strong><small>Operations workspace</small></div></div>
        <div className="user-area"><span>{user.firstName} {user.lastName}<small>{user.role.replaceAll('_', ' ')}</small></span><Account onChanged={signOut}/><button className="quiet-button" onClick={signOut}>Sign out</button></div>
      </header>

      <nav className="module-tabs" aria-label="Workspace"><button className={tab === 'desk' ? 'selected' : ''} onClick={() => setTab('desk')}>Patient desk</button>{hasDepartments && <button className={tab === 'departments' && hasDepartments ? 'selected' : ''} onClick={() => {setTab('departments'); void refresh(query).catch(e => setError(e.message));}}>Departments & administration</button>}{canPerform(user.role,'reports.read') && <button className={tab === 'reports' ? 'selected' : ''} onClick={()=>{setReportsOpened(true);setTab('reports');}}>Reports</button>}{canPerform(user.role,'staff.create') && <button className={tab === 'employees' ? 'selected' : ''} onClick={()=>{setTab('employees');void refresh().catch(e=>setError(e.message));}}>Employees</button>}</nav>
      {reportsOpened && canPerform(user.role,'reports.read') && <div hidden={tab !== 'reports'}><Reports key={user.id} active={tab === 'reports'} /></div>}
      <div className="motion-page" key={tab} hidden={tab === 'reports'}>
      {tab === 'employees' && canPerform(user.role,'staff.create') ? <Employees role={user.role} userId={user.id} patients={patients} /> : tab === 'departments' && hasDepartments ? <Operations role={user.role} patients={patients} visits={visits} userId={user.id} /> : <>
      <section className="welcome-row">
        <div><p className="eyebrow">TODAY AT THE CLINIC</p><h1>Patient desk</h1><p className="subtle">Register patients, open visits, and track active workflow.</p></div>
        <div className="today-pill">{new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(new Date())}</div>
      </section>

      {error && <p className="alert error">{error}</p>}
      {notice && <p className="alert success">{notice}</p>}

      {user.role === 'RECEPTIONIST' && <p className="alert success">Reception access: register and edit patients, open visits, and view patient history. Only administrators can delete patients. Department access is restricted.</p>}
      <section className="stats">
        <article className="stat-card"><span>Patients shown</span><strong>{patients.length}</strong><small>Search results</small></article>
        <article className="stat-card"><span>Active visits</span><strong>{summary.active}</strong><small>All clinic visits</small></article>
        <article className="stat-card"><span>Waiting</span><strong>{summary.waiting}</strong><small>All clinic visits</small></article>
      </section>

      {canRegister && <section className="actions-grid">
        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">RECEPTION</p><h2>Register a patient</h2></div><span className="panel-symbol">＋</span></div>
          <form onSubmit={createPatient} className="form-grid">
            <label>First name<input name="firstName" maxLength={80} required /></label>
            <label>Last name<input name="lastName" maxLength={80} required /></label>
            <label>Phone<input name="phone" type="tel" maxLength={30} /></label>
            <label>Gender<select name="gender" defaultValue="NOT_SPECIFIED"><option value="NOT_SPECIFIED">Not specified</option><option value="FEMALE">Female</option><option value="MALE">Male</option><option value="OTHER">Other</option></select></label>
            <label>Date of birth<input name="dateOfBirth" type="date" max={new Date().toISOString().slice(0,10)} /></label>
            <label>Emergency contact<input name="emergencyContact" maxLength={200} /></label>
            <label>Next of kin<input name="nextOfKin" maxLength={200} /></label>
            <label>Allergies<input name="allergies" maxLength={2000} /></label>
            <label className="full">Medical alerts<input name="medicalAlerts" maxLength={2000} /></label>
            <button className="wide-button" disabled={busy}>Create patient record</button>
          </form>
        </article>

        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">VISIT MANAGEMENT</p><h2>Open a visit</h2></div><span className="panel-symbol">↗</span></div>
          <form onSubmit={createVisit} className="form-grid">
            <RecordPicker kind="patients" name="patientId" label="Patient"/>
            <label>Visit type<select name="type" defaultValue="OUTPATIENT"><option value="OUTPATIENT">Outpatient</option><option value="INPATIENT">Inpatient</option></select></label>
            <label>Reason<input name="reason" maxLength={1000} required /></label>
            <button className="wide-button" disabled={busy}>Open visit</button>
          </form>
        </article>
      </section>

      }
      <section className="panel patient-panel">
        <div className="panel-heading list-heading"><div><p className="eyebrow">PATIENT REGISTER</p><h2>Patients &amp; visits</h2></div><input className="search" value={query} onChange={(event) => { setQuery(event.target.value);setPage(1);setPatientPage(1); }} placeholder="Search name or patient number" aria-label="Search patients" /></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Patient</th><th>Patient ID</th><th>Phone</th><th>Visit</th><th>Type</th><th>Status</th>{canWorkflow && <th>Workflow</th>}</tr></thead>
            <tbody>
              {visibleVisits.map((visit) => <tr key={visit.id}><td><strong>{visit.patient.firstName} {visit.patient.lastName}</strong><small>{visit.reason}</small></td><td>{visit.patient.patientNumber}</td><td>{visit.patient.phone ?? '—'}</td><td>{visit.visitNumber}</td><td>{visit.type.replace('_', ' ')}</td><td><span className={`status ${visit.status.toLowerCase()}`}>{visit.status.replaceAll('_', ' ')}</span></td>{canWorkflow && <td><VisitWorkflow role={user.role} visit={visit} onSaved={() => refresh(query)} /></td>}</tr>)}
              {visibleVisits.length === 0 && <tr><td colSpan={canWorkflow ? 7 : 6} className="empty">No visits yet. Register a patient, then open a visit.</td></tr>}
            </tbody>
          </table>
        </div>
        <nav className="inline-form" aria-label="Visit pages"><button className="quiet-button" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous visits</button><span>Page {page}</span><button className="quiet-button" disabled={visits.length<50} onClick={()=>setPage(p=>p+1)}>Next visits</button></nav>
        <div className="patient-list">
          {patients.map((patient) => <div className="patient-row" key={patient.id}><span className="avatar">{patient.firstName[0]}{patient.lastName[0]}</span><span><strong>{patient.firstName} {patient.lastName}</strong><small>{patient.patientNumber} · {patient.phone ?? 'No phone'}</small></span><PatientChart id={patient.id} role={user.role} onChanged={() => refresh(query)} /></div>)}
          {patients.length === 0 && <p className="empty">No patients found.</p>}
          {canPerform(user.role,'patients.read') && <nav className="inline-form" aria-label="Patient pages"><button className="quiet-button" disabled={patientPage===1} onClick={()=>setPatientPage(p=>p-1)}>Previous patients</button><span>Page {patientPage} · {patientTotal} patients</span><button className="quiet-button" disabled={patientPage*50>=patientTotal} onClick={()=>setPatientPage(p=>p+1)}>Next patients</button></nav>}
        </div>
      </section>
      </>}
      </div>
      <footer>Clinic operations foundation · Secure access is role-controlled and patient actions are audit logged.</footer>
    </main>
  );
}

function VisitWorkflow({visit,onSaved,role}:{visit:Visit;onSaved:()=>Promise<void>;role:string}) {
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const [history,setHistory]=useState<{id:string;toStatus:string;note?:string;changedAt:string;changedBy:{firstName:string;lastName:string}}[]|null>(null);
 return <><form className="workflow-form" onSubmit={async e=>{ e.preventDefault();const form=e.currentTarget;const data=new FormData(form);setBusy(true);setError('');try{await api(`/visits/${visit.id}/status`,{method:'POST',body:JSON.stringify({status:data.get('status'),note:data.get('note')||undefined})});await onSaved();form.reset();}catch(err){setError(err instanceof Error?err.message:'Unable to update visit.');}finally{setBusy(false);} }}>
 {visitTransitionsFor(role,visit.status).length>0 && <><select name="status" required defaultValue="" aria-label="Next visit status"><option value="" disabled>Move visit to…</option>{visitTransitionsFor(role,visit.status).map(s=><option key={s}>{s}</option>)}</select><input name="note" placeholder="Workflow note" aria-label="Workflow note" maxLength={500}/><button className="quiet-button" disabled={busy}>Update</button></>}
 </form><button type="button" className="quiet-button" onClick={async()=>{try{setHistory(await api('/visits/'+visit.id+'/history'));}catch(e){setError(e instanceof Error?e.message:'Unable to load history.');}}}>Workflow history</button>{history && <div className="workflow-history">{history.map(h=><p key={h.id}>{h.toStatus.replaceAll('_',' ')} · {new Date(h.changedAt).toLocaleString('en-KE')}<br/>{h.changedBy.firstName} {h.changedBy.lastName}{h.note && <><br/>{h.note}</>}</p>)}</div>}{error && <p className="alert error" role="alert">{error}</p>}</>;
}
