'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

import { canPerform, modulesFor, visitTransitionsFor } from '@cms/access';
import { LoadingState } from '../components/motion';
import PatientChart from './patient-record';
import Account from './account';
import RecordPicker from '../components/record-picker';
import PatientFlowReport from './patient-flow-report';

import { api, ApiError } from '../lib/api';

const Operations = dynamic(() => import('./operations'), { loading: () => <LoadingState label="Loading departments…" /> });
const Reports = dynamic(() => import('./reports'), { loading: () => <LoadingState label="Loading reports…" /> });
const Employees = dynamic(() => import('./employees'), { loading: () => <LoadingState label="Loading employees…" /> });
const Portal = dynamic(() => import('./portal'), { loading: () => <LoadingState label="Loading your clinic record…" /> });
const departmentLabels: Record<string,string> = { inpatient:'Inpatient care', triage:'Triage', clinical:'Clinical records', labs:'Laboratory', stock:'Pharmacy stock', movements:'Stock usage history', prescriptions:'Prescriptions', invoices:'Billing & payments', recovery:'Recovery', catering:'Catering', appointments:'Appointments', expenses:'Expenses', staff:'Employees & accounts', reports:'Reports', audit:'Audit log' };

const workareaIconPaths: Record<string, string> = {
  waiting:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2',
  triage:'M12 21s-8-4.5-8-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 11c0 5.5-8 10-8 10ZM8 12h2l1-2 2 4 1-2h2',
  clinical:'M8 3h8l2 2v16H6V3h2Zm1 5h6M9 12h6M9 16h4',
  labs:'M9 3h6M10 3v7l-5 8a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-8V3M8 15h8',
  stock:'M4 7h16v13H4zM3 4h18v3H3zM9 11h6M12 8v6',
  movements:'M4 7h13l-3-3m3 3-3 3M20 17H7l3-3m-3 3 3 3',
  prescriptions:'M7 3h10v18H7zM10 7h4m-2-2v4m-2 4h4m-4 3h4',
  inpatient:'M3 19V8m18 11v-6a3 3 0 0 0-3-3H9v7m-6 0h18M6 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  appointments:'M4 5h16v16H4zM8 3v4m8-4v4M4 9h16m-10 5h4m-2-2v4',
  invoices:'M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm4 5h6m-6 4h6m-6 4h3',
  patient:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0',
};
function WorkareaIcon({area}:{area:string}) {
  return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={workareaIconPaths[area] ?? 'M12 4v16M4 12h16'}/></svg>;
}

type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
};

type DashboardReport = { appointments: number; labPending: number; outstandingCents: number; stockAlerts: { id: string }[]; departments: { department: string; _count: number }[] };

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
  const [tab, setTab] = useState('dashboard');
  const [deskTarget, setDeskTarget] = useState('');
  const [reportsOpened, setReportsOpened] = useState(false);
  const [menuOpen, setMenuOpen] = useState(true);
  const [department, setDepartment] = useState('inpatient');
  const [user, setUser] = useState<User | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [page,setPage] = useState(1);
  const [patientPage,setPatientPage] = useState(1);
  const [patientTotal,setPatientTotal] = useState(0);
  const [summary,setSummary] = useState({active:0,waiting:0});
  const [dashboardReports, setDashboardReports] = useState<{today: DashboardReport; all: DashboardReport} | null>(null);
  const [dashboardReportError, setDashboardReportError] = useState(false);
  const [consultation, setConsultation] = useState<{patient:Record<string, unknown>;patientName:string;phone:string;amount:number;attemptId?:string;status?:string;message?:string} | null>(null);

  useEffect(() => {
    if (tab !== 'desk' || !deskTarget) return;
    document.getElementById(deskTarget)?.scrollIntoView({behavior:'smooth',block:'start'});
    setDeskTarget('');
  }, [tab, deskTarget]);

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

  const pendingAttemptId = consultation?.status === 'PENDING' ? consultation.attemptId : undefined;
  useEffect(() => {
    if (!pendingAttemptId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const result = await api<{status:string;message?:string}>(`/mpesa/consultation/${pendingAttemptId}`);
        if (!active) return;
        setConsultation(current => current?.attemptId === pendingAttemptId ? {...current,...result} : current);
        if (result.status === 'CONFIRMED') {
          await refresh(query);
          return;
        }
        if (result.status !== 'PENDING') return;
      } catch {
        // A temporary connection failure does not determine payment status.
      }
      if (active) timer = setTimeout(check, 5000);
    };
    timer = setTimeout(check, 5000);
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [pendingAttemptId, query, refresh]);



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
    setDashboardReports(null);
    setDashboardReportError(false);
    if (!user || tab !== 'dashboard' || !canPerform(user.role, 'reports.read')) return;
    let active = true;
    const parts = new Intl.DateTimeFormat('en-GB', {timeZone:'Africa/Nairobi', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(new Date());
    const date = `${parts.find(p=>p.type==='year')?.value}-${parts.find(p=>p.type==='month')?.value}-${parts.find(p=>p.type==='day')?.value}`;
    Promise.all([api<DashboardReport>(`/operations/reports?from=${date}&to=${date}`), api<DashboardReport>('/operations/reports')])
      .then(([today, all])=>{if(active) setDashboardReports({today, all});})
      .catch(()=>{if(active) setDashboardReportError(true);});
    return ()=>{active=false;};
  }, [user, tab]);

  useEffect(() => {
    if (!user) return;
    const timeout = window.setTimeout(() => {
      if (user.role === 'PATIENT') { void import('./portal'); return; }
      if (modulesFor(user.role).length) void import('./operations');
      if (canPerform(user.role, 'reports.read')) void import('./reports');
      if (canPerform(user.role, 'staff.create')) void import('./employees');
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [user]);

  useEffect(() => {
    api<User>('/auth/me')
      .then((activeUser) => {
        roleRef.current = activeUser.role;
        setUser(activeUser);
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
      setTab('dashboard');
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
      const patient = {
          firstName: form.get('firstName'),
          lastName: form.get('lastName'),
          phone: form.get('phone') || undefined,
          gender: form.get('gender'),
          dateOfBirth: form.get('dateOfBirth') || undefined,
          allergies: form.get('allergies') || undefined,
          medicalAlerts: form.get('medicalAlerts') || undefined,
          emergencyContact: form.get('emergencyContact') || undefined,
          nextOfKin: form.get('nextOfKin') || undefined,
        };
      const payment = {patient,patientName:`${form.get('firstName')} ${form.get('lastName')}`.trim(),phone:String(form.get('phone') ?? ''),amount:Number(form.get('consultationFee'))};
      setConsultation(payment);
      formElement.reset();
      setNotice('Send the payment prompt to complete registration.');
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
        <div className="login-layout">
        <aside className="login-intro">
          <div className="login-intro-brand"><span aria-hidden="true">+</span><strong>CLINIC MANAGEMENT SYSTEM</strong></div>
          <div className="login-intro-copy"><p className="login-intro-kicker">A BETTER DAY OF CARE</p><h2 aria-label="Care starts with connection."><span className="login-typing" aria-hidden="true"><span className="login-typing-first">Care starts</span><span className="login-typing-second">with connection.</span></span></h2><p>Everything your clinic needs, together in one place.</p><div className="login-intro-line" aria-hidden="true" /></div>
          <p className="login-intro-footer">YOUR CLINIC WORKSPACE <span> / </span> BUILT FOR CARE</p>
        </aside>
        <section className="login-card">
          <div className="brand-icon" aria-hidden="true">+</div>
          <p className="eyebrow">CLINIC MANAGEMENT SYSTEM</p>
          <h1>Welcome back</h1>
          <p className="subtle">Sign in with your clinic account to continue.</p>
          {forgotPassword ? <div className="password-recovery"><h2>{recoverySent ? 'Enter your code' : 'Reset your password'}</h2><p>{recoverySent ? 'If an active account matches this email, a code has been sent. It expires in 10 minutes. Your new password must contain at least 14 characters.' : 'Enter your account email and we’ll send you a verification code.'}</p><form className="form-stack" onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');setRecoveryMessage('');const form=new FormData(event.currentTarget);try{if(!recoverySent){const email=String(form.get('email')??'').trim();await api('/auth/password-recovery',{method:'POST',body:JSON.stringify({email})});setRecoveryEmail(email);setRecoverySent(true);}else{const password=String(form.get('password')??'');if(password!==form.get('confirmation')){setError('Passwords do not match.');return;}await api('/auth/password-recovery/reset',{method:'POST',body:JSON.stringify({email:recoveryEmail,code:form.get('code'),password})});setRecoverySent(false);setForgotPassword(false);setNotice('Password reset. Please sign in with your new password.');}}catch(e){setError(e instanceof Error?e.message:'Unable to reset your password.');}finally{setBusy(false);}}}>{!recoverySent ? <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254}/></label> : <><label>Verification code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label><label>New password<input name="password" type="password" autoComplete="new-password" minLength={14} maxLength={72} required /></label><label>Confirm new password<input name="confirmation" type="password" autoComplete="new-password" minLength={14} maxLength={72} required /></label></>}{error && <p className="alert error" role="alert">{error}</p>}{recoveryMessage && <p className="alert success" role="status">{recoveryMessage}</p>}<button disabled={busy}>{busy ? 'Please wait…' : recoverySent ? 'Set new password' : 'Send code'}</button></form>{recoverySent && <button type="button" className="quiet-button" disabled={busy} onClick={()=>{setRecoverySent(false);setError('');}}>Use a different email or resend</button>}<button type="button" className="quiet-button" onClick={()=>{setForgotPassword(false);setRecoverySent(false);setError('');}}>Back to sign in</button></div> : <>
          <form onSubmit={signIn} className="form-stack">
            <label>Email address<input name="email" type="email" autoComplete="username" required /></label>
            <label>Password<span className="password-field"><input name="password" type={showLoginPassword ? 'text' : 'password'} autoComplete="current-password" required /><button type="button" className="password-toggle" aria-label={showLoginPassword ? 'Hide password' : 'Show password'} aria-pressed={showLoginPassword} onClick={() => setShowLoginPassword(value => !value)}><svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{showLoginPassword && <path d="M4 4l16 16"/>}</svg></button></span></label>
            <button type="button" className="forgot-password" onClick={()=>{setError('');setForgotPassword(true);}}>Forgot password?</button>
            {error && <p className="alert error">{error}</p>}
            {notice && <p className="alert success" role="status">{notice}</p>}
            <button disabled={busy} aria-busy={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <p className="login-footnote">Accounts are provisioned by your clinic administrator.</p>
          </>}
        </section>
        </div>
      </main>
    );
  }

  if (user.role === 'PATIENT') return <Portal onSignOut={signOut} />;
  const canRegister = canPerform(user.role,'patients.create');
  const hasDepartments = modulesFor(user.role).length > 0;
  const canWorkflow = canPerform(user.role,'visits.status');
  const visibleVisits = visits;
  return (
    <main className={`workspace${tab === 'desk' || tab === 'dashboard' ? ' workspace-photo' : ''}${tab === 'dashboard' ? ' workspace-dashboard-photo reference-dashboard' : ''}${tab === 'desk' ? ' desk-reference' : ''}${tab !== 'desk' && tab !== 'dashboard' ? ' workarea-reference' : ''}`}>
      <aside className="reference-sidebar"><div className="reference-brand"><span>✚</span><strong>Clinic<br/>Management</strong></div><nav aria-label="Main navigation"><button className={tab==='dashboard'?'active':''} onClick={()=>setTab('dashboard')}><span>⌂</span> Dashboard</button><button className={tab==='desk'?'active':''} onClick={()=>setTab('desk')}><span>♙</span> Patient desk</button>{modulesFor(user.role).filter(key=>!['reports','staff'].includes(key)).map(key=><button key={key} className={tab==='departments' && department===key?'active':''} onClick={()=>{setDepartment(key);setTab('departments');}}><span>{key==='clinical'?'▱':key==='labs'?'♧':key==='prescriptions'?'◇':'▤'}</span>{departmentLabels[key] ?? key}</button>)}{canPerform(user.role,'reports.read') && <button className={tab==='reports'?'active':''} onClick={()=>{setReportsOpened(true);setTab('reports');}}><span>▥</span> Reports</button>}{canPerform(user.role,'staff.create') && <button className={tab==='employees'?'active':''} onClick={()=>setTab('employees')}><span>⚙</span> Employees</button>}</nav></aside>
      <header className="topbar">
        {tab === 'dashboard' ? <strong className="reference-header-title">Clinic Management</strong> : <div className="brand-line"><div className="brand-icon small">+</div><div><strong>Clinic CMS</strong><small>Operations workspace</small></div></div>}
        <div className="user-area"><span>{user.firstName} {user.lastName}</span><Account onChanged={signOut} onSignOut={signOut}/></div>
      </header>

      <nav className="module-tabs workspace-navigation" aria-label="Workspace"><button type="button" className={`workspace-menu-icon${menuOpen ? ' selected' : ''}`} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="workspace-menu" title="Menu" onClick={() => setMenuOpen(!menuOpen)}><span aria-hidden="true"><i></i><i></i><i></i></span></button><button className={tab === 'dashboard' ? 'selected' : ''} onClick={() => {setTab('dashboard');}}>Dashboard</button>{menuOpen && <div id="workspace-menu" className="workspace-menu"><p>WORK AREAS</p><button type="button" className={tab==='desk'?'selected':''} onClick={()=>{setTab('desk');}}>Patient desk</button>{modulesFor(user.role).map(key=><button type="button" key={key} className={tab==='departments' && department===key?'selected':''} onClick={()=>{setDepartment(key);setTab('departments');}}>{departmentLabels[key] ?? key}</button>)}</div>}</nav>
      {reportsOpened && canPerform(user.role,'reports.read') && <div hidden={tab !== 'reports'}><Reports key={user.id} active={tab === 'reports'} /></div>}
      <div className="motion-page" key={tab} hidden={tab === 'reports'}>
      {tab === 'dashboard' ? <section className="reference-content">
        <div className="reference-title"><h1>Patient Desk</h1><p>Register patients and manage today’s visits</p></div>
        {error && <p className="alert error" role="alert">{error}</p>}
        <div className="reference-metrics">
          {canPerform(user.role,'patients.read') && <article><span className="reference-metric-icon">♙</span><div><b>Registered patients</b><strong>{patientTotal}</strong></div></article>}
          {canPerform(user.role,'visits.read') && <><article><span className="reference-metric-icon">◷</span><div><b>Waiting</b><strong>{summary.waiting}</strong></div></article><article><span className="reference-metric-icon">✚</span><div><b>Active visits</b><strong>{summary.active}</strong></div></article></>}
          {canPerform(user.role,'reports.read') && <article><span className="reference-metric-icon">▣</span><div><b>Appointments today</b><strong>{dashboardReports ? dashboardReports.today.appointments : '—'}</strong></div></article>}
        </div>
        {dashboardReportError && <p className="alert error" role="status">Appointment figures could not be loaded.</p>}
        <div className="reference-columns"><div className="reference-main">
          <div className="reference-toolbar">{canRegister && <><button className="reference-primary" onClick={()=>{setDeskTarget('register-patient');setTab('desk');}}>＋ Register patient</button><button className="reference-secondary" onClick={()=>{setDeskTarget('open-visit');setTab('desk');}}>＋ Open visit</button></>}{canPerform(user.role,'patients.read') && <form onSubmit={e=>{e.preventDefault();setPage(1);setPatientPage(1);setTab('desk');}}><span>⌕</span><input aria-label="Search patients" placeholder="Search patient by name or phone" value={query} onChange={e=>setQuery(e.target.value)}/><button type="submit" aria-label="Search">→</button></form>}</div>
          {canPerform(user.role,'visits.read') && <section className="reference-card reference-queue"><div className="reference-card-heading"><h2>Recent patient visits</h2><button onClick={()=>setTab('desk')}>View all →</button></div><div className="dashboard-table-wrap"><table><thead><tr><th>Patient</th><th>Visit type</th><th>Arrival</th><th>Status</th><th>Action</th></tr></thead><tbody>{visits.slice(0,5).map(visit=><tr key={visit.id}><td><strong>{visit.patient.firstName} {visit.patient.lastName}</strong><small>{visit.patient.patientNumber}</small></td><td>{visit.type.replaceAll('_',' ')}</td><td>{new Intl.DateTimeFormat('en-KE',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Nairobi'}).format(new Date(visit.arrivedAt))}</td><td><span className="dashboard-status">{visit.status.replaceAll('_',' ')}</span></td><td>{canPerform(user.role,'visits.update') ? <VisitEdit visit={visit} role={user.role} onSaved={()=>refresh(query)}/> : <button className="reference-open" onClick={()=>setTab('desk')}>Open</button>}{canPerform(user.role,'visits.delete') && <button type="button" className="visit-delete" disabled={busy} onClick={async()=>{if(!window.confirm(`Delete visit ${visit.visitNumber}? Visits with linked clinical, admission, or billing records cannot be deleted.`))return;setBusy(true);setError('');try{await api(`/visits/${visit.id}`,{method:'DELETE'});await refresh(query);}catch(e){setError(e instanceof Error?e.message:'Unable to delete visit.');}finally{setBusy(false);}}}>Delete</button>}</td></tr>)}{visits.length===0 && <tr><td colSpan={5} className="dashboard-empty">No visits to display.</td></tr>}</tbody></table></div></section>}
        </div><aside className="reference-card reference-overview"><h2>Quick overview</h2>{canPerform(user.role,'reports.read') && <div className="reference-overview-stat"><span>▣</span><div><b>Today’s appointments</b><strong>{dashboardReports ? dashboardReports.today.appointments : '—'}</strong></div></div>}<div className="reference-overview-links"><h3>Clinic work areas</h3>{modulesFor(user.role).slice(0,5).map(key=><button key={key} onClick={()=>{setDepartment(key);setTab('departments');}}><span>✚</span><b>{departmentLabels[key] ?? key}</b><i>→</i></button>)}{!hasDepartments && <button onClick={()=>setTab('desk')}><span>♙</span><b>Patient desk</b><i>→</i></button>}</div></aside></div>
      </section> : tab === 'employees' && canPerform(user.role,'staff.create') ? <Employees role={user.role} userId={user.id} patients={patients} /> : tab === 'departments' && hasDepartments ? <Operations key={department} role={user.role} patients={patients} visits={visits} userId={user.id} initialModule={department} externalMenu /> : <>
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
        <article className="panel" id="register-patient">
          <div className="panel-heading"><div><p className="eyebrow">RECEPTION</p><h2>Register a patient</h2></div><span className="panel-symbol">＋</span></div>
          <form onSubmit={createPatient} className="form-grid">
            <label>First name<input name="firstName" maxLength={80} required /></label>
            <label>Last name<input name="lastName" maxLength={80} required /></label>
            <label>Gender<select name="gender" defaultValue="NOT_SPECIFIED"><option value="NOT_SPECIFIED">Not specified</option><option value="FEMALE">Female</option><option value="MALE">Male</option><option value="OTHER">Other</option></select></label>
            <label>Date of birth<input name="dateOfBirth" type="date" max={new Date().toISOString().slice(0,10)} /></label>
            <label>Emergency contact<input name="emergencyContact" maxLength={200} /></label>
            <label>Next of kin<input name="nextOfKin" maxLength={200} /></label>
            <label>Allergies<input name="allergies" maxLength={2000} /></label>
            <label className="full">Medical alerts<input name="medicalAlerts" maxLength={2000} /></label>
            <div className="consultation-fee full"><div className="consultation-fee-heading"><span className="mpesa-phone-icon" aria-hidden="true"><svg viewBox="0 0 48 64" fill="none"><rect x="6" y="3" width="36" height="58" rx="6" stroke="currentColor" strokeWidth="2.5"/><path d="M17 3v4h14V3" stroke="currentColor" strokeWidth="2.5"/><circle cx="24" cy="43" r="8" fill="#128b42"/><path d="m20 43 3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></span><div><strong>M-Pesa payment</strong><p>Enter the phone number and consultation amount.</p></div><span className="consultation-badge">Sandbox</span></div><label>Phone number<input name="phone" type="tel" required pattern="(0|254)[17][0-9]{8}" placeholder="e.g. 0712345678" title="Enter a Kenyan mobile number such as 0712345678 or 254712345678" /></label><label>Amount (KES)<input name="consultationFee" type="number" required min="1" max="150000" step="1" placeholder="Enter amount" /></label><small>Send the payment prompt to complete registration.</small><button className="wide-button" disabled={busy}>{busy ? 'Please wait…' : 'Continue to payment'}</button></div>
          </form>
          {consultation && <div className="consultation-overlay"><div className="consultation-payment" role="dialog" aria-modal="true" aria-labelledby="consultation-payment-title"><button type="button" className="consultation-close" aria-label="Close payment panel" onClick={()=>setConsultation(null)}>×</button><div className="collect-heading"><span className="collect-icon" aria-hidden="true">▣<small>M-PESA</small></span><div><h3 id="consultation-payment-title">Collect Consultation Fee</h3><p>M-PESA STK Push · Sandbox payment</p></div></div><div className="consultation-summary"><div><span>Patient name</span><strong>{consultation.patientName}</strong></div><div><span>Consultation type</span><strong>General consultation</strong></div><div><span>Payment status</span><strong>{consultation.status === 'CONFIRMED' ? 'Paid' : consultation.status === 'CANCELLED' ? 'Cancelled' : consultation.status === 'PENDING' ? 'Pending' : consultation.status === 'FAILED' ? 'Failed' : consultation.status === 'UNKNOWN' ? 'Unknown' : 'Unpaid'}</strong></div></div><div className="collect-amount"><span>Consultation fee</span><label className="collect-amount-edit">Amount (KES)<input type="number" aria-label="Consultation amount in KES" min="1" max="150000" step="1" value={consultation.amount || ""} disabled={!!consultation.status || busy} onChange={e=>setConsultation({...consultation,amount:Number(e.target.value)})} /></label><small>Full amount required</small></div><label className="collect-phone">M-PESA phone number<input type="tel" value={consultation.phone} disabled={!!consultation.status || busy} onChange={e=>setConsultation({...consultation,phone:e.target.value})} pattern="(0|254)[17][0-9]{8}" /></label>{!consultation.status && <><p className="collect-info">The payment is recorded only after M-Pesa confirms the full amount.</p><button type="button" className="wide-button" disabled={busy || !Number.isInteger(consultation.amount) || consultation.amount < 1 || consultation.amount > 150000 || !/^(0|254)[17]\d{8}$/.test(consultation.phone)} onClick={async()=>{setBusy(true);setError('');try{const result=await api<{id:string;status:string}>('/mpesa/consultation',{method:'POST',body:JSON.stringify({patient:{...consultation.patient,phone:consultation.phone},phone:consultation.phone,amount:consultation.amount})});setConsultation({...consultation,attemptId:result.id,status:result.status});await refresh(query);}catch(e){if(!(e instanceof ApiError && [400,401,403,503].includes(e.status))) setConsultation({...consultation,status:'UNKNOWN',message:'The request status is uncertain. Check billing before trying again.'});setError(e instanceof Error?e.message:'Unable to start the M-Pesa request.');}finally{setBusy(false);}}}>{busy ? 'Sending…' : `Send STK Push — KES ${consultation.amount.toLocaleString(undefined,{minimumFractionDigits:2})}`}</button></>}{consultation.status && <><p role="status" className="payment-result" data-status={consultation.status}>{consultation.status === 'CONFIRMED' ? 'Payment successfully confirmed.' : consultation.status === 'CANCELLED' ? 'Payment cancelled. No payment was recorded.' : consultation.status === 'FAILED' ? 'Payment not completed' : consultation.status === 'UNKNOWN' ? 'Prompt status unknown; reconcile before trying again.' : 'Awaiting payment confirmation'}</p>{consultation.message && <p>{consultation.message}</p>}{consultation.attemptId && consultation.status==='PENDING' && <button type="button" className="quiet-button" disabled={busy} onClick={async()=>{setBusy(true);try{const result=await api<{status:string;message?:string}>(`/mpesa/consultation/${consultation.attemptId}`);setConsultation({...consultation,...result});if(result.status==="CONFIRMED") await refresh(query);}catch(e){setError(e instanceof Error?e.message:'Unable to check payment status.');}finally{setBusy(false);}}}>Check payment status</button>}</>}</div></div>}
        </article>

        <article className="panel" id="open-visit">
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
            <thead><tr><th>Patient</th><th>Phone</th><th>Type</th><th>Status</th>{canWorkflow && <th>Workflow</th>}{canPerform(user.role,'visits.delete') && <th>Action</th>}</tr></thead>
            <tbody>
              {visibleVisits.map((visit) => <tr key={visit.id}><td><strong>{visit.patient.firstName} {visit.patient.lastName}</strong><small>{visit.reason}</small></td><td>{visit.patient.phone ?? '—'}</td><td>{visit.type.replace('_', ' ')}</td><td><span className={`status ${visit.status.toLowerCase()}`}>{visit.status.replaceAll('_', ' ')}</span></td>{canWorkflow && <td><VisitWorkflow role={user.role} visit={visit} onSaved={() => refresh(query)} /></td>}{canPerform(user.role,'visits.delete') && <td><button type="button" className="visit-delete" disabled={busy} onClick={async()=>{if(!window.confirm(`Delete the visit for ${visit.patient.firstName} ${visit.patient.lastName}? This permanently deletes its workflow history. Visits with linked clinical, admission, or billing records cannot be deleted.`))return;setBusy(true);setError('');try{await api(`/visits/${visit.id}`,{method:'DELETE'});await refresh(query);}catch(e){setError(e instanceof Error?e.message:'Unable to delete visit.');}finally{setBusy(false);}}}>Delete</button></td>}</tr>)}
              {visibleVisits.length === 0 && <tr><td colSpan={4 + (canWorkflow ? 1 : 0) + (canPerform(user.role,'visits.delete') ? 1 : 0)} className="empty">No visits yet. Register a patient, then open a visit.</td></tr>}
            </tbody>
          </table>
        </div>
        <nav className="inline-form" aria-label="Visit pages"><button className="quiet-button" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous visits</button><span>Page {page}</span><button className="quiet-button" disabled={visits.length<50} onClick={()=>setPage(p=>p+1)}>Next visits</button></nav>
        <div className="patient-list">
          {patients.map((patient) => <div className="patient-row" key={patient.id}><span className="avatar">{patient.firstName[0]}{patient.lastName[0]}</span><span><strong>{patient.firstName} {patient.lastName}</strong><small>{patient.phone ?? 'No phone'}</small></span><PatientChart id={patient.id} role={user.role} onChanged={() => refresh(query)} /></div>)}
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

function VisitEdit({visit,onSaved,role}:{visit:Visit;onSaved:()=>Promise<void>;role:string}) {
 const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 return <><button type="button" className="quiet-button" onClick={()=>setOpen(true)}>Update</button>{open && <div className="consultation-overlay"><div className="consultation-payment" role="dialog" aria-modal="true" aria-label={`Update visit ${visit.visitNumber}`}><button type="button" className="consultation-close" aria-label="Close" onClick={()=>setOpen(false)}>×</button><h3>Update visit</h3><p>{visit.patient.firstName} {visit.patient.lastName} · {visit.visitNumber}</p><form className="visit-edit-form" onSubmit={async e=>{e.preventDefault();const data=new FormData(e.currentTarget);setBusy(true);setError('');try{await api(`/visits/${visit.id}`,{method:'PATCH',body:JSON.stringify({type:data.get('type'),reason:data.get('reason')})});await onSaved();setOpen(false);}catch(err){setError(err instanceof Error?err.message:'Unable to update visit.');}finally{setBusy(false);}}}><label>Visit type<select name="type" defaultValue={visit.type}><option value="OUTPATIENT">Outpatient</option><option value="INPATIENT">Inpatient</option></select></label><label>Reason<input name="reason" defaultValue={visit.reason} minLength={2} maxLength={1000} required /></label><button className="quiet-button" disabled={busy}>Save changes</button></form><VisitWorkflow visit={visit} role={role} onSaved={onSaved}/>{error && <p className="alert error" role="alert">{error}</p>}</div></div>}</>;
}

function VisitWorkflow({visit,onSaved,role}:{visit:Visit;onSaved:()=>Promise<void>;role:string}) {
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const [history,setHistory]=useState<{id:string;toStatus:string;note?:string;changedAt:string;changedBy:{firstName:string;lastName:string}}[]|null>(null);
 return <><form className="workflow-form" onSubmit={async e=>{ e.preventDefault();const form=e.currentTarget;const data=new FormData(form);setBusy(true);setError('');try{await api(`/visits/${visit.id}/status`,{method:'POST',body:JSON.stringify({status:data.get('status'),note:data.get('note')||undefined})});await onSaved();form.reset();}catch(err){setError(err instanceof Error?err.message:'Unable to update visit.');}finally{setBusy(false);} }}>
 {visitTransitionsFor(role,visit.status).length>0 && <><select name="status" required defaultValue="" aria-label="Next visit status"><option value="" disabled>Move visit to…</option>{visitTransitionsFor(role,visit.status).map(s=><option key={s}>{s}</option>)}</select><input name="note" placeholder="Workflow note" aria-label="Workflow note" maxLength={500}/><button className="quiet-button" disabled={busy}>Update</button></>}
 </form><button type="button" className="quiet-button" onClick={async()=>{try{setHistory(await api('/visits/'+visit.id+'/history'));}catch(e){setError(e instanceof Error?e.message:'Unable to load history.');}}}>Workflow history</button>{history && <div className="workflow-history"><div className="workflow-history-heading"><strong>Workflow history</strong><button type="button" className="workflow-history-close" aria-label="Close workflow history" onClick={()=>setHistory(null)}>&#215;</button></div>{history.map(h=><p key={h.id}>{h.toStatus.replaceAll('_',' ')} · {new Date(h.changedAt).toLocaleString('en-KE')}<br/>{h.changedBy.firstName} {h.changedBy.lastName}{h.note && <><br/>{h.note}</>}</p>)}</div>}{error && <p className="alert error" role="alert">{error}</p>}</>;
}
