'use client';

import { PatientAllergyInput, PatientDigitsInput, PatientNameInput, readPatientAllergies } from './patient-inputs';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import Image from 'next/image';

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
const paymentStatuses = new Map([
  ['PENDING', { label: 'Pending', description: 'Awaiting payment confirmation' }],
  ['AWAITING_RECEIPT', { label: 'Paid', description: 'Payment confirmed by M-Pesa. Receipt pending.' }],
  ['CONFIRMED', { label: 'Paid', description: 'Payment successful' }],
  ['CANCELLED', { label: 'Cancelled', description: 'Payment cancelled. No payment was recorded.' }],
  ['FAILED', { label: 'Failed', description: 'Payment not completed' }],
  ['UNKNOWN', { label: 'Unknown', description: 'Payment status unavailable. Check the payment before resending.' }],
]);

const sidebarGroups = [
  {title: 'Patient Care', items: [['desk', 'Patient Desk', 'patient'], ['triage', 'Triage', 'triage'], ['appointments', 'Appointments', 'appointments'], ['clinical', 'Clinical Records', 'clinical'], ['inpatient', 'Inpatient Care', 'inpatient']]},
  {title: 'Clinical Services', items: [['labs', 'Laboratory', 'labs'], ['stock', 'Pharmacy', 'medicine'], ['prescriptions', 'Prescriptions', 'prescriptions']]},
  {title: 'Finance & Inventory', items: [['invoices', 'Billing & Payments', 'card'], ['recovery', 'Recovery', 'invoices'], ['inventory', 'Stock Management', 'stock']]},
  {title: 'Administration', items: [['staff', 'Employees', 'patient'], ['catering', 'Catering', 'catering'], ['expenses', 'Expenses', 'wallet'], ['reports', 'Reports', 'reports'], ['audit', 'Audit Log', 'audit']]},
] as const;

const workareaIconPaths: Record<string, string> = {
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  lock: 'M5 10h14v11H5zM8 10V7a4 4 0 0 1 8 0v3M12 14v3',
  signin: 'M14 3h6v18h-6M3 12h12m-5-5 5 5-5 5',
  dashboard: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  medicine: 'M8 20a5 5 0 0 1-4-8l8-8a5 5 0 0 1 7 7l-8 8a5 5 0 0 1-3 1Zm0-11 7 7',
  catering: 'M4 3v5a3 3 0 0 0 6 0V3M7 3v18M18 3c-2 0-3 2-3 5v4h4V3m0 9v9',
  reports: 'M4 20V12m5 8V5m6 15V9m5 11V3',
  audit: 'M12 2l8 4v6c0 4-4 8-8 10-4-2-8-6-8-10V6Zm-4 10 3 3 5-6',
  message: "M20 15H9l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2Z",
  card: "M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm-2 5h20m-6 5h2",
  wallet: "M21 8H5a2 2 0 0 1 0-4h13v4m3 0v12H5a2 2 0 0 1-2-2V6m18 6h-6a2 2 0 0 0 0 4h6",
  call: "M7 3 4 4c-1 1-1 4 0 6a21 21 0 0 0 10 10c2 1 5 1 6 0l1-3-5-3-2 2a14 14 0 0 1-6-6l2-2-3-5Z",
  mobile: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm3 17h2",
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

function ApplewoodLogo({className}: {className: string}) {
  return <>
    <svg width="0" height="0" className="applewood-logo-filter" aria-hidden="true">
      <defs>
        <filter id="applewood-logo-cutout" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="
            1 0 0 0 0
            0 1 0 0 0
            0 0 1 0 0
            -.26 -.52 -.26 1.04 0" />
          <feComponentTransfer><feFuncA type="linear" slope="2" intercept="-.06" /></feComponentTransfer>
        </filter>
        <filter id="applewood-logo-on-dark" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="
            .78 0 0 0 .30
            0 .78 0 0 .25
            0 0 .78 0 .28
            -.26 -.52 -.26 1.04 0" />
          <feComponentTransfer><feFuncA type="linear" slope="2" intercept="-.06" /></feComponentTransfer>
        </filter>
      </defs>
    </svg>
    <Image className={className} src="/images/applewood-logo.png" alt="Applewood Medical Centre"
      width={637} height={239} priority />
  </>;
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
  const [savedLoginEmail, setSavedLoginEmail] = useState('');
  useEffect(() => {
    try { setSavedLoginEmail(localStorage.getItem('cms:sign-in-email') ?? ''); } catch {}
  }, []);
  const [recoverySent, setRecoverySent] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [page,setPage] = useState(1);
  const [patientPage,setPatientPage] = useState(1);
  const [patientTotal,setPatientTotal] = useState(0);
  const [summary,setSummary] = useState({active:0,waiting:0});
  const [dashboardReports, setDashboardReports] = useState<{today: DashboardReport; all: DashboardReport} | null>(null);
  const [dashboardReportError, setDashboardReportError] = useState(false);
  const [stockMenuOpen, setStockMenuOpen] = useState(false);
  const [openSidebarGroups, setOpenSidebarGroups] = useState<string[]>([]);
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

  const pendingAttemptId = consultation?.status === 'PENDING' || consultation?.status === 'AWAITING_RECEIPT' ? consultation.attemptId : undefined;
  const registrationForm = useRef<HTMLFormElement>(null);
  const paymentConfirmed = consultation?.status === 'CONFIRMED';
  const closeConsultation = useCallback(() => {
    if (paymentConfirmed) setNotice('Payment successful. The consultation fee has been recorded.');
    setConsultation(null);
  }, [paymentConfirmed]);

  useEffect(() => {
    if (!paymentConfirmed) return;
    registrationForm.current?.reset();
    const timer = setTimeout(closeConsultation, 5000);
    return () => clearTimeout(timer);
  }, [paymentConfirmed, closeConsultation]);

  useEffect(() => {
    if (!pendingAttemptId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const result = await api<{status:string;message?:string}>(`/mpesa/consultation/${pendingAttemptId}`);
        if (!active) return;
        setConsultation(current => current?.attemptId === pendingAttemptId && ['PENDING', 'AWAITING_RECEIPT'].includes(current.status ?? '') ? {...current,...result} : current);
        if (result.status === 'CONFIRMED') {
          await refresh(query);
          return;
        }
        if (result.status !== 'PENDING' && result.status !== 'AWAITING_RECEIPT') return;
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
      if (!roleRef.current) return;
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
      const rememberedEmail = form.has('rememberEmail') ? String(form.get('email')).trim() : '';
      try {
        if (rememberedEmail) localStorage.setItem('cms:sign-in-email', rememberedEmail);
        else localStorage.removeItem('cms:sign-in-email');
      } catch {}
      setSavedLoginEmail(rememberedEmail);
      setUser(result.user);
      setOpenSidebarGroups([]);
      setStockMenuOpen(false);
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

  async function deleteVisit(visit: Visit) {
    if (!window.confirm("Delete this visit from the Patient Desk? Linked clinical, admission, and billing records will be preserved in the visit history.")) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{deleted: boolean; archived?: boolean}>('/visits/' + visit.id, {method: 'DELETE'});
      setNotice(result.archived ? 'Visit archived and removed from the Patient Desk.' : 'Visit deleted.');
      await refresh(query);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to delete visit.');
    } finally {
      setBusy(false);
    }
  }

  async function sendConsultation() {
    if (!consultation || !canSendConsultation) return;
    const { patient, phone, amount } = consultation;
    setBusy(true);
    setError('');
    try {
      const attempt = await api<{id: string; status: string}>('/mpesa/consultation', {
        method: 'POST',
        body: JSON.stringify({ patient: { ...patient, phone }, phone, amount }),
      });
      setConsultation({ ...consultation, attemptId: attempt.id, status: attempt.status, message: undefined });
    } catch (error) {
      if (!(error instanceof ApiError && [400, 401, 403, 503].includes(error.status))) {
        setConsultation({ ...consultation, attemptId: undefined, status: 'UNKNOWN', message: 'The request status is uncertain. Check billing before trying again.' });
      }
      setError(error instanceof Error ? error.message : 'Unable to start the M-Pesa request.');
    } finally {
      setBusy(false);
    }
  }

  function openConsultation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError('');
    setNotice('');
    const patient = {
      firstName: form.get('firstName'),
      lastName: form.get('lastName'),
      gender: form.get('gender'),
      age: form.get('age') ? Number(form.get('age')) : undefined,
      allergies: readPatientAllergies(form) ?? undefined,
      medicalAlerts: form.get('medicalAlerts') || undefined,
      emergencyContact: form.get('emergencyContact') || undefined,
      nextOfKin: form.get('nextOfKin') || undefined,
    };
    setConsultation({ patient, patientName: `${patient.firstName} ${patient.lastName}`.trim(), phone: '', amount: 0 });
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
          <div className="login-intro-brand">
            <span aria-hidden="true"><Image src="/images/applewood-logo.png" alt="" width={637} height={239} /></span>
            <strong>CLINIC MANAGEMENT SYSTEM</strong>
          </div>
          <div className="login-intro-copy">
            <p className="login-intro-kicker">A better day of care</p>
            <h2 aria-label="Care starts with connection."><span className="login-typing" aria-hidden="true">
              <span className="login-typing-first">Care starts</span>
              <span className="login-typing-second">with <em>connection.</em></span>
            </span></h2>
            <p>Everything your clinic needs, together in one place.</p>
            <ul className="login-feature-list">
              {[['patient','Patients'], ['appointments','Appointments'], ['triage','Consultations'], ['labs','Laboratory']].map(([icon, label]) =>
                <li key={label}><WorkareaIcon area={icon} />{label}</li>)}
            </ul>
          </div>
          <p className="login-intro-footer"><WorkareaIcon area="triage" />Your Health. Our Priority.</p>
        </aside>
        <section className="login-card">
          <ApplewoodLogo className="login-logo" />
          <p className="eyebrow">CLINIC MANAGEMENT SYSTEM</p>
          <h1>Welcome back</h1>
          <p className="subtle">Sign in with your clinic account to continue.</p>
          {forgotPassword ? <div className="password-recovery"><h2>{recoverySent ? 'Enter your code' : 'Reset your password'}</h2><p>{recoverySent ? 'If an active account matches this email, a code has been sent. It expires in 10 minutes. Your new password must contain at least 14 characters.' : 'Enter your account email and we’ll send you a verification code.'}</p><form className="form-stack" onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');setRecoveryMessage('');const form=new FormData(event.currentTarget);try{if(!recoverySent){const email=String(form.get('email')??'').trim();await api('/auth/password-recovery',{method:'POST',body:JSON.stringify({email})});setRecoveryEmail(email);setRecoverySent(true);}else{const password=String(form.get('password')??'');if(password!==form.get('confirmation')){setError('Passwords do not match.');return;}await api('/auth/password-recovery/reset',{method:'POST',body:JSON.stringify({email:recoveryEmail,code:form.get('code'),password})});setRecoverySent(false);setForgotPassword(false);setNotice('Password reset. Please sign in with your new password.');}}catch(e){setError(e instanceof Error?e.message:'Unable to reset your password.');}finally{setBusy(false);}}}>{!recoverySent ? <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254}/></label> : <><label>Verification code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label><label>New password<input name="password" type="password" autoComplete="new-password" minLength={14} maxLength={72} required /></label><label>Confirm new password<input name="confirmation" type="password" autoComplete="new-password" minLength={14} maxLength={72} required /></label></>}{error && <p className="alert error" role="alert">{error}</p>}{recoveryMessage && <p className="alert success" role="status">{recoveryMessage}</p>}<button disabled={busy}>{busy ? 'Please wait…' : recoverySent ? 'Set new password' : 'Send code'}</button></form>{recoverySent && <button type="button" className="quiet-button" disabled={busy} onClick={()=>{setRecoverySent(false);setError('');}}>Use a different email or resend</button>}<button type="button" className="quiet-button" onClick={()=>{setForgotPassword(false);setRecoverySent(false);setError('');}}>Back to sign in</button></div> : <>
          <form onSubmit={signIn} className="form-stack">
            <label><span className="login-field-label"><WorkareaIcon area="mail" />Email address</span><input name="email" type="email" autoComplete="username" defaultValue={savedLoginEmail} required /></label>
            <label><span className="login-field-label"><WorkareaIcon area="lock" />Password</span><span className="login-input password-field"><input name="password" type={showLoginPassword ? 'text' : 'password'} autoComplete="current-password" required /><button type="button" className="password-toggle" aria-label={showLoginPassword ? 'Hide password' : 'Show password'} aria-pressed={showLoginPassword} onClick={() => setShowLoginPassword(value => !value)}><svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{showLoginPassword && <path d="M4 4l16 16"/>}</svg></button></span></label>
            <div className="login-options">
              <label><input type="checkbox" name="rememberEmail" defaultChecked={!!savedLoginEmail} />Remember email</label>
              <button type="button" className="forgot-password" onClick={()=>{setError('');setForgotPassword(true);}}>Forgot password?</button>
            </div>
            {error && <p className="alert error">{error}</p>}
            {notice && <p className="alert success" role="status">{notice}</p>}
            <button className="login-submit" disabled={busy} aria-busy={busy}><WorkareaIcon area="signin" />{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <p className="login-footnote"><WorkareaIcon area="audit" />Accounts are provisioned by your clinic administrator.</p>
          </>}
        </section>
        </div>
      </main>
    );
  }

  if (user.role === 'PATIENT') return <Portal onSignOut={signOut} />;
  const canRegister = canPerform(user.role,'patients.create');
  const role = user.role;
  const availableModules = modulesFor(role);
  const hasDepartments = availableModules.length > 0;
  const paymentFieldsLocked = busy || consultation?.status === 'AWAITING_RECEIPT' || consultation?.status === 'CONFIRMED' || consultation?.status === 'UNKNOWN';
  const paymentStatus = consultation?.status
    ? paymentStatuses.get(consultation.status) ?? paymentStatuses.get('UNKNOWN')
    : undefined;
  const paymentCanRetry = consultation?.status === 'CANCELLED' || consultation?.status === 'FAILED';
  const canSendConsultation = !!consultation && !busy && (!consultation.status || paymentCanRetry)
    && Number.isInteger(consultation.amount) && consultation.amount >= 1 && consultation.amount <= 150000
    && /^(0|254)[17][0-9]{8}$/.test(consultation.phone);
  function sidebarAccess(key: string) {
    if (key === 'desk') return true;
    if (key === 'reports') return canPerform(role, 'reports.read');
    if (key === 'staff') return canPerform(role, 'staff.create');
    if (key === 'inventory') return availableModules.includes('stock') || availableModules.includes('movements');
    return availableModules.includes(key);
  }
  function sidebarDepartmentButton(key: string, label: string, icon: string, highlight = true) {
    if (!sidebarAccess(key)) return null;
    const target = key === 'desk' || key === 'reports' ? key : key === 'staff' ? 'employees' : 'departments';
    const active = highlight && tab === target && (target !== 'departments' || department === key);
    return <button key={key} type="button" className={active ? 'active' : ''} onClick={() => {
      if (target === 'departments') setDepartment(key);
      if (target === 'reports') setReportsOpened(true);
      setTab(target);
    }}><WorkareaIcon area={icon} />{label}</button>;
  }
  const canWorkflow = canPerform(user.role,'visits.status');
  const visibleVisits = visits;
  return (
    <main className={`workspace${tab === 'desk' || tab === 'dashboard' ? ' workspace-photo' : ''}${tab === 'dashboard' ? ' workspace-dashboard-photo reference-dashboard' : ''}${tab === 'desk' ? ' desk-reference' : ''}${tab !== 'desk' && tab !== 'dashboard' ? ' workarea-reference' : ''}`}>
      <aside className="reference-sidebar">
        <ApplewoodLogo className="sidebar-logo" />
        <nav aria-label="Main navigation" className="grouped-sidebar">
          <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}><WorkareaIcon area="dashboard" />Dashboard</button>
          {sidebarGroups.map(({ title, items }) => {
            const visible = items.filter(([key]) => sidebarAccess(key));
            if (!visible.length) return null;
            const open = openSidebarGroups.includes(title);
            const linksId = 'sidebar-' + title.toLowerCase().replace(/[^a-z]+/g, '-');
            return <div className="sidebar-group" key={title} role="group" aria-label={title}>
              <button type="button" className="sidebar-heading" aria-expanded={open} aria-controls={linksId}
                onClick={() => setOpenSidebarGroups(groups => groups.includes(title) ? groups.filter(group => group !== title) : [...groups, title])}>
                {title}
              </button>
              <div id={linksId} className="sidebar-collapse" inert={!open}>
                <div className="sidebar-group-links">
                  {visible.map(([key, label, icon]) => key === 'inventory' ?
                    <div key={key} className="sidebar-inventory">
                      <button type="button" className="sidebar-inventory-toggle" aria-expanded={stockMenuOpen}
                        aria-controls="sidebar-stock-links" onClick={() => setStockMenuOpen(open => !open)}>
                        <WorkareaIcon area={icon} />{label}
                      </button>
                      <div id="sidebar-stock-links" className="sidebar-collapse" inert={!stockMenuOpen}>
                        <div className="sidebar-group-links">
                          {sidebarDepartmentButton('stock', 'Stock Inventory', 'stock', false)}
                          {sidebarDepartmentButton('movements', 'Stock Usage History', 'movements')}
                        </div>
                      </div>
                    </div> : sidebarDepartmentButton(key, label, icon))}
                </div>
              </div>
            </div>;
          })}
        </nav>
      </aside>
      <header className="topbar">
        {tab !== 'dashboard' && <div className="brand-line"><div className="brand-icon small">+</div><div><strong>Clinic CMS</strong><small>Operations workspace</small></div></div>}
        <div className="user-area"><span>{user.firstName} {user.lastName}</span><Account onChanged={signOut} onSignOut={signOut}/></div>
      </header>

      <nav className="module-tabs workspace-navigation" aria-label="Workspace"><button type="button" className={`workspace-menu-icon${menuOpen ? ' selected' : ''}`} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="workspace-menu" title="Menu" onClick={() => setMenuOpen(!menuOpen)}><span aria-hidden="true"><i></i><i></i><i></i></span></button><button className={tab === 'dashboard' ? 'selected' : ''} onClick={() => {setTab('dashboard');}}>Dashboard</button>{menuOpen && <div id="workspace-menu" className="workspace-menu"><p>WORK AREAS</p><button type="button" className={tab==='desk'?'selected':''} onClick={()=>{setTab('desk');}}>Patient desk</button>{modulesFor(user.role).map(key=><button type="button" key={key} className={tab==='departments' && department===key?'selected':''} onClick={()=>{setDepartment(key);setTab('departments');}}>{departmentLabels[key] ?? key}</button>)}</div>}</nav>
      {reportsOpened && canPerform(user.role,'reports.read') && <div hidden={tab !== 'reports'}><Reports key={user.id} active={tab === 'reports'} /></div>}
      <div className="motion-page" key={tab} hidden={tab === 'reports'}>
      {tab === 'dashboard' ? <section className="reference-content">
        <div className="reference-title"><h1>{user.firstName} {user.lastName}</h1><p>Register patients and manage today’s visits</p></div>
        {error && <p className="alert error" role="alert">{error}</p>}
        <div className="reference-metrics">
          {canPerform(user.role,'patients.read') && <article><span className="reference-metric-icon">♙</span><div><b>Registered patients</b><strong>{patientTotal}</strong></div></article>}
          {canPerform(user.role,'visits.read') && <><article><span className="reference-metric-icon">◷</span><div><b>Waiting</b><strong>{summary.waiting}</strong></div></article><article><span className="reference-metric-icon">✚</span><div><b>Active visits</b><strong>{summary.active}</strong></div></article></>}
          {canPerform(user.role,'reports.read') && <article><span className="reference-metric-icon">▣</span><div><b>Appointments today</b><strong>{dashboardReports ? dashboardReports.today.appointments : '—'}</strong></div></article>}
        </div>
        {dashboardReportError && <p className="alert error" role="status">Appointment figures could not be loaded.</p>}
        <div className="reference-columns"><div className="reference-main">
          <div className="reference-toolbar">{canRegister && <><button className="reference-primary" onClick={()=>{setDeskTarget('register-patient');setTab('desk');}}>＋ Register patient</button><button className="reference-secondary" onClick={()=>{setDeskTarget('open-visit');setTab('desk');}}>＋ Open visit</button></>}{canPerform(user.role,'patients.read') && <form onSubmit={e=>{e.preventDefault();setPage(1);setPatientPage(1);setTab('desk');}}><span>⌕</span><input aria-label="Search patients" placeholder="Search patient by name or phone" value={query} onChange={e=>setQuery(e.target.value)}/><button type="submit" aria-label="Search">→</button></form>}</div>
          {canPerform(user.role,'visits.read') && <section className="reference-card reference-queue"><div className="reference-card-heading"><h2>Recent patient visits</h2><button onClick={()=>setTab('desk')}>View all →</button></div><div className="dashboard-table-wrap"><table><thead><tr><th>Patient</th><th>Visit type</th><th>Arrival</th><th>Status</th><th>Action</th></tr></thead><tbody>{visits.slice(0,5).map(visit=><tr key={visit.id}><td><strong>{visit.patient.firstName} {visit.patient.lastName}</strong><small>{visit.patient.patientNumber}</small></td><td>{visit.type.replaceAll('_',' ')}</td><td>{new Intl.DateTimeFormat('en-KE',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Nairobi'}).format(new Date(visit.arrivedAt))}</td><td><span className="dashboard-status">{visit.status.replaceAll('_',' ')}</span></td><td>{canPerform(user.role,'visits.update') ? <VisitEdit visit={visit} role={user.role} onSaved={()=>refresh(query)}/> : <button className="reference-open" onClick={()=>setTab('desk')}>Open</button>}{canPerform(user.role,'visits.delete') && <button type="button" className="visit-delete" disabled={busy} onClick={() => deleteVisit(visit)}>Delete</button>}</td></tr>)}{visits.length===0 && <tr><td colSpan={5} className="dashboard-empty">No visits to display.</td></tr>}</tbody></table></div></section>}
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
          <form ref={registrationForm} onSubmit={openConsultation} className="form-grid">
            <label>First name<PatientNameInput name="firstName" required /></label>
            <label>Last name<PatientNameInput name="lastName" required /></label>
            <label>Gender<select name="gender" defaultValue="NOT_SPECIFIED"><option value="NOT_SPECIFIED">Not specified</option><option value="FEMALE">Female</option><option value="MALE">Male</option><option value="OTHER">Other</option></select></label>
            <label>Age<PatientDigitsInput name="age" /></label>
            <label>Emergency contact<PatientDigitsInput name="emergencyContact" /></label>
            <label>Next of kin<input name="nextOfKin" maxLength={200} /></label>
            <PatientAllergyInput />
            <label className="full">Medical alerts<input name="medicalAlerts" maxLength={2000} /></label>
            <button type="submit" className="wide-button continue-payment" disabled={busy}>Continue to Payment</button>
          </form>
          {paymentConfirmed ? createPortal(
            <section className="payment-success-screen" role="dialog" aria-modal="true"
              aria-labelledby="payment-success-title" aria-describedby="payment-success-description"
              onKeyDown={event => {
                if (event.key === 'Escape') closeConsultation();
                if (event.key === 'Tab') event.preventDefault();
              }}>
              <span className="payment-success-icon" aria-hidden="true">&#10003;</span>
              <h2 id="payment-success-title">Payment successful</h2>
              <p id="payment-success-description">The consultation fee has been recorded.</p>
              <button type="button" autoFocus onClick={closeConsultation}>Done</button>
            </section>, document.body
          ) : consultation && <div className="consultation-overlay"><div className="consultation-payment consultation-fee-dialog" role="dialog" aria-modal="true" aria-labelledby="consultation-payment-title"><button type="button" className="consultation-close" aria-label="Close payment panel" onClick={closeConsultation}>×</button>
            <div className="collect-heading"><span className="collect-icon" aria-hidden="true"><WorkareaIcon area="mobile" /><small>M-PESA</small></span><div><h3 id="consultation-payment-title">Consultation Fee</h3><p>M-PESA STK Push · Sandbox</p></div></div>
            {error && <p className="alert error" role="alert">{error}</p>}
            <div className="consultation-summary">
              <div><WorkareaIcon area="patient" /><span>Patient name</span><strong title={consultation.patientName}>{consultation.patientName}</strong></div>
              <div><WorkareaIcon area="message" /><span>Type</span><strong>General consultation</strong></div>
              <div><WorkareaIcon area="card" /><span>Status</span><strong className="collect-status" data-status={consultation.status}>{paymentStatus?.label ?? 'Unpaid'}</strong></div></div>
            <div className="collect-amount"><WorkareaIcon area="wallet" /><label className="collect-amount-edit"><span>Consultation Fee</span><span className="collect-currency"><b>KES</b><input type="text" inputMode="numeric" aria-label="Consultation amount in KES" placeholder="Amount" pattern="[0-9]+" value={consultation.amount || ""} disabled={paymentFieldsLocked} onChange={event => { const value = event.currentTarget.value; if (/^[0-9]{0,6}$/.test(value)) setConsultation(current => current && {...current, amount: Number(value)}); }} /></span></label><small>Full amount required</small></div>
            <label className="collect-phone"><span><WorkareaIcon area="call" />M-PESA Phone Number</span><input type="tel" inputMode="numeric" minLength={8} maxLength={30} placeholder="e.g. 0712345678" value={consultation.phone} disabled={paymentFieldsLocked} onChange={event => { const phone = event.currentTarget.value.replace(/[^0-9]/g, ''); setConsultation(current => current && {...current, phone}); }} pattern="[0-9]{8,30}" />{(!consultation.status || paymentCanRetry) && !/^(0|254)[17][0-9]{8}$/.test(consultation.phone) && <small>Enter a Kenyan M-Pesa number such as 0712345678 or 254712345678 to send the prompt.</small>}</label>{!consultation.status && <><p className="collect-info"><span aria-hidden="true">&#10003;</span>Payment will be recorded after M-Pesa confirms it.</p></>}{consultation.status && <><p role="status" className="payment-result" data-status={consultation.status}>{paymentStatus?.description}</p>{consultation.status === 'AWAITING_RECEIPT' ? <p>Do not resend this payment.</p> : consultation.message && <p>{consultation.message}</p>}{consultation.status === 'PENDING' && <p>Edits apply to the next prompt. You can retry once M-Pesa reports that this prompt was cancelled or failed.</p>}</>}
            {(!consultation.status || consultation.status === 'PENDING' || paymentCanRetry) &&
              <button type="button" className="wide-button" disabled={!canSendConsultation} onClick={sendConsultation}>
                <WorkareaIcon area="mobile" />
                {busy ? 'Sending…' : 'Send STK Push — KES ' + consultation.amount.toLocaleString('en-KE', {minimumFractionDigits: 2})}
              </button>}
          </div></div>}
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
              {visibleVisits.map((visit) => <tr key={visit.id}><td><strong>{visit.patient.firstName} {visit.patient.lastName}</strong><small>{visit.reason}</small></td><td>{visit.patient.phone ?? '—'}</td><td>{visit.type.replace('_', ' ')}</td><td><span className={`status ${visit.status.toLowerCase()}`}>{visit.status.replaceAll('_', ' ')}</span></td>{canWorkflow && <td><VisitWorkflow role={user.role} visit={visit} onSaved={() => refresh(query)} /></td>}{canPerform(user.role,'visits.delete') && <td><button type="button" className="visit-delete" disabled={busy} onClick={() => deleteVisit(visit)}>Delete</button></td>}</tr>)}
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
