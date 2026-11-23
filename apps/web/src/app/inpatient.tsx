'use client';
import {FormEvent,useCallback,useEffect,useRef,useState} from 'react';
import {ADMIN_ROLES,CLINICIAN_ROLES} from '@cms/access';
import {api} from '../lib/api';
import RecordPicker from '../components/record-picker';
import {LoadingState} from '../components/motion';

type Bed={id:string;ward:string;name:string;admissions:{id:string}[]};
type Clinician={id:string;firstName:string;lastName:string};
type Admission={id:string;bed:Bed;clinician:Clinician;admittedAt:string;dischargedAt?:string;dischargeSummary?:string;visit:{visitNumber:string;patient:{firstName:string;lastName:string;patientNumber:string}};events:{id:string;action:string;details:string;createdAt:string}[]};

export default function Inpatient({role}:{role:string}) {
  const [beds,setBeds]=useState<Bed[]>([]),[clinicians,setClinicians]=useState<Clinician[]>([]),[rows,setRows]=useState<Admission[]>([]);
  const [page,setPage]=useState(1),[search,setSearch]=useState(''),[status,setStatus]=useState('ACTIVE');
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const request=useRef(0);
  const clinical=[...ADMIN_ROLES,...CLINICIAN_ROLES].includes(role);
  const load=useCallback(async()=>{
    const id=++request.current;setLoading(true);
    try{
      const [b,c,a]=await Promise.all([api<Bed[]>('/workflows/beds'),api<Clinician[]>('/workflows/clinicians'),api<Admission[]>(`/workflows/admissions?${new URLSearchParams({page:String(page),pageSize:'50',search,status})}`)]);
      if(id===request.current){setBeds(b);setClinicians(c);setRows(a);setError('');}
    }catch(e){if(id===request.current)setError(e instanceof Error?e.message:'Unable to load admissions.');}
    finally{if(id===request.current)setLoading(false);}
  },[page,search,status]);
  useEffect(()=>{const timeout=window.setTimeout(()=>void load(),250);return()=>{window.clearTimeout(timeout);request.current++;};},[load]);
  async function save(event:FormEvent<HTMLFormElement>,path:string){
    event.preventDefault();const form=event.currentTarget;setBusy(true);setError('');setNotice('');
    try{await api('/workflows/'+path,{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});form.reset();await load();setNotice('Saved successfully.');}
    catch(e){setError(e instanceof Error?e.message:'Unable to save admission.');}finally{setBusy(false);}
  }
  const free=beds.filter(b=>!b.admissions.length);
  const bedOptions=free.map(b=><option key={b.id} value={b.id}>{b.ward} / {b.name}</option>);
  return <section className="inpatient"><div className="inpatient-heading"><div><p className="eyebrow">WARD MANAGEMENT</p><h2>Inpatient care</h2><p className="subtle">Manage beds, admissions and patient transfers.</p></div><button className="quiet-button" disabled={loading||busy} onClick={()=>void load()}>Refresh</button></div>{error&&<p className="alert error" role="alert">{error}</p>}{notice&&<p className="alert success" role="status">{notice}</p>}
    <div className="stats"><article className="stat-card"><span>Available beds</span><strong>{free.length}</strong></article><article className="stat-card"><span>Occupied beds</span><strong>{beds.length-free.length}</strong></article></div>
    <div className="inpatient-forms">{ADMIN_ROLES.includes(role)&&<form className="panel form-grid inpatient-form" onSubmit={e=>void save(e,'beds')}><div className="full inpatient-form-title"><h3>Add a bed</h3><p>Add a bed to a ward.</p></div><label>Ward<input name="ward" required maxLength={80}/></label><label>Bed name / number<input name="name" required maxLength={80}/></label><button className="wide-button" disabled={busy}>Add bed</button></form>}
    {clinical&&<form className="panel form-grid inpatient-form" onSubmit={e=>void save(e,'admissions')}><div className="full inpatient-form-title"><h3>Admit a patient</h3><p>Assign a visit, bed and responsible clinician.</p></div><RecordPicker kind="visits" name="visitId" label="Visit"/><label>Available bed<select name="bedId" required defaultValue=""><option value="">Select bed</option>{bedOptions}</select></label><label>Responsible clinician<select name="clinicianId" required defaultValue=""><option value="">Select clinician</option>{clinicians.map(c=><option value={c.id} key={c.id}>{c.firstName} {c.lastName}</option>)}</select></label><label className="full">Admission reason<textarea name="reason" required maxLength={2000}/></label><button className="wide-button" disabled={busy||!free.length}>Admit patient</button></form>}</div>
    <div className="inpatient-list-heading"><div><p className="eyebrow">PATIENTS</p><h3>Admissions</h3></div></div><div className="panel form-grid inpatient-filters"><label>Find patient<input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Search by patient name or number"/></label><label>Admissions<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="ACTIVE">Currently admitted</option><option value="DISCHARGED">Discharged</option></select></label></div>
    {loading?<LoadingState label="Loading inpatient care…"/>:<div className="record-list">{rows.map(a=><article className="panel" key={a.id}><h3>{a.visit.patient.firstName} {a.visit.patient.lastName} · {a.visit.patient.patientNumber}</h3><p>{a.visit.visitNumber} · {a.bed.ward}/{a.bed.name}<br/>Clinician: {a.clinician.firstName} {a.clinician.lastName}<br/>Admitted: {new Date(a.admittedAt).toLocaleString('en-KE')}</p>
      {!a.dischargedAt&&<><form className="form-grid" onSubmit={e=>void save(e,`admissions/${a.id}/transfer`)}><label>Transfer to<select name="bedId" required defaultValue=""><option value="">Select available bed</option>{bedOptions}</select></label><label>Reason<input name="reason" required maxLength={2000}/></label><button className="quiet-button" disabled={busy||!free.length}>Transfer patient</button></form>{clinical&&<details><summary>Discharge patient</summary><form className="form-stack" onSubmit={e=>void save(e,`admissions/${a.id}/discharge`)}><label>Discharge summary and follow-up<textarea name="summary" required minLength={10} maxLength={10000}/></label><button disabled={busy}>Discharge and release bed</button></form></details>}</>}
      {a.dischargeSummary&&<p><b>Discharge summary:</b> {a.dischargeSummary}</p>}<details><summary>Admission history</summary>{a.events.map(e=><p key={e.id}><b>{e.action}</b> · {new Date(e.createdAt).toLocaleString('en-KE')}<br/>{e.details}</p>)}</details></article>)}{!rows.length&&<p className="empty">No matching admissions.</p>}</div>}
    <nav className="inline-form" aria-label="Admission pages"><button className="quiet-button" disabled={page===1||loading} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page}</span><button className="quiet-button" disabled={rows.length<50||loading} onClick={()=>setPage(p=>p+1)}>Next</button></nav>
  </section>;
}
