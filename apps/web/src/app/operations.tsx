'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { canAccessModule, canPerform, CLINICIAN_ROLES, STAFF_ROLES } from '@cms/access';
import Reports from './reports';
import { LoadingState } from '../components/motion';
import { api } from '../lib/api';
type Person = { id:string; patientNumber:string; firstName:string; lastName:string };
type Visit = { id:string; visitNumber:string; status:string; patient:Omit<Person,'id'> };
type Row = { id:string; department?:string; summary?:string; details?:Record<string,string|number>; createdAt?:string;category?:string;reference?:string;incurredAt?:string; visit?:Visit; patient?:Person; testName?:string; status?:string; result?:string; name?:string; batch?:string; quantity?:number; reorderLevel?:number; expiresAt?:string; instructions?:string; stockItem?:{name:string}; dispensedAt?:string; description?:string; amountCents?:number; payments?:{amountCents:number}[]; scheduledAt?:string; reason?:string; email?:string; firstName?:string; lastName?:string; role?:string; active?:boolean; action?:string; entityId?:string; user?:{firstName:string;lastName:string} };
type Field = { name:string; label:string; type?:string; options?:string[]; optional?:boolean; min?:number; max?:number; step?:string };
type Module = { key:string; label:string; area:string; fields:Field[] };
const careFields:Field[] = [{name:'summary',label:'Assessment / care note',type:'textarea'}];
const modules:Module[] = [
 {key:'triage',label:'Triage',area:'care',fields:[...careFields,{name:'temperature',label:'Temperature (°C)',type:'number',min:25,max:45,step:'0.1',optional:true},{name:'systolic',label:'Systolic BP (mmHg)',type:'number',min:30,max:300,optional:true},{name:'diastolic',label:'Diastolic BP (mmHg)',type:'number',min:10,max:200,optional:true},{name:'pulse',label:'Pulse (bpm)',type:'number',min:10,max:300,optional:true},{name:'weight',label:'Weight (kg)',type:'number',min:0.1,max:700,step:'0.1',optional:true},{name:'oxygen',label:'Oxygen saturation (%)',type:'number',min:1,max:100,optional:true}]},
 {key:'clinical',label:'Clinical records',area:'care',fields:[...careFields,{name:'diagnosis',label:'Diagnosis'},{name:'plan',label:'Treatment plan',type:'textarea'}]},
 {key:'labs',label:'Laboratory',area:'labs',fields:[{name:'testName',label:'Requested test'}]},
 {key:'stock',label:'Pharmacy stock',area:'stock',fields:[{name:'name',label:'Medicine / strength'},{name:'batch',label:'Batch number'},{name:'expiresAt',label:'Expiry date',type:'date'},{name:'quantity',label:'Opening quantity',type:'number',min:0},{name:'reorderLevel',label:'Reorder level',type:'number',min:0}]},
 {key:'movements',label:'Stock usage history',area:'movements',fields:[]},
 {key:'prescriptions',label:'Prescriptions',area:'prescriptions',fields:[{name:'stockItemId',label:'Medicine batch',type:'stock'},{name:'quantity',label:'Quantity',type:'number',min:1},{name:'instructions',label:'Dose, frequency and duration',type:'textarea'}]},
 {key:'invoices',label:'Billing & payments',area:'invoices',fields:[{name:'description',label:'Charge description'},{name:'amount',label:'Amount (KES)',type:'number',min:0.01,step:'0.01'}]},
 {key:'recovery',label:'Recovery',area:'care',fields:[...careFields,{name:'observation',label:'Observation / nursing care',type:'textarea'}]},
 {key:'catering',label:'Catering',area:'care',fields:[...careFields,{name:'diet',label:'Diet / meal order'},{name:'restrictions',label:'Dietary restrictions',optional:true}]},
 {key:'appointments',label:'Appointments',area:'appointments',fields:[{name:'scheduledAt',label:'Appointment time',type:'datetime-local'},{name:'reason',label:'Reason'}]},
 {key:'expenses',label:'Expenses',area:'expenses',fields:[{name:'description',label:'Expense description'},{name:'category',label:'Category',options:['SUPPLIES','SALARIES','UTILITIES','RENT','MAINTENANCE','OTHER']},{name:'amount',label:'Amount (KES)',type:'number',min:0.01,step:'0.01'},{name:'reference',label:'Unique expense reference'},{name:'incurredAt',label:'Incurred date',type:'date'}]},
 {key:'staff',label:'Staff administration',area:'staff',fields:[{name:'firstName',label:'First name'},{name:'lastName',label:'Last name'},{name:'email',label:'Email',type:'email'},{name:'password',label:'Initial password (14–72 characters)',type:'password'},{name:'patientId',label:'Patient record (required only for patient accounts)',type:'patient',optional:true},{name:'role',label:'Role',options:[...STAFF_ROLES,'PATIENT']}]},
 {key:'reports',label:'Reports',area:'reports',fields:[]},
 {key:'audit',label:'Audit log',area:'audit',fields:[]},
];
const currency = (cents:number) => new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES'}).format(cents/100);
const date = (value?:string) => value ? new Date(value).toLocaleString('en-KE') : '';
export default function Operations({role,patients,visits,userId,embeddedArea}:{role:string;patients:Person[];visits:Visit[];userId:string;embeddedArea?:'prescriptions'}) {
 const available = modules.filter(m => embeddedArea ? m.key === embeddedArea && canPerform(role,'prescriptions.read') : canAccessModule(role,m.key));
 const [key,setKey] = useState(available[0]?.key ?? '');
 const mod = available.find(m => m.key === key) ?? available[0];
 const [rows,setRows] = useState<Row[]>([]);
 const [stock,setStock] = useState<Row[]>([]);
 const [error,setError] = useState(''); const [notice,setNotice] = useState(''); const [busy,setBusy] = useState(false); const [loading,setLoading] = useState(false);
 const load = useCallback(async () => {
   if (!mod) return;
   if (mod.area === 'reports') { setLoading(false); return; }
   setLoading(true); setError('');
   try {
     setRows(await api<Row[]>(`/operations/${mod.area}`));
     if (mod.area === 'prescriptions') setStock(await api<Row[]>('/operations/stock'));
   } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load module.'); }
   finally { setLoading(false); }
 },[mod]);
 useEffect(() => { setRows([]); setNotice(''); void load(); },[load]);
 async function submit(event:FormEvent<HTMLFormElement>, path:string, transform?:(data:Record<string,unknown>)=>Record<string,unknown>) {
   event.preventDefault(); const form=event.currentTarget;
   const data:Record<string,unknown> = {};
   new FormData(form).forEach((v,k) => { if (v !== '') data[k]=v; });
   setBusy(true);setError('');setNotice('');
   try { await api(`/operations/${path}`,{method:'POST',body:JSON.stringify(transform ? transform(data) : data)}); form.reset(); await load();setNotice('Saved successfully.'); }
   catch(e) {setError(e instanceof Error ? e.message : 'Unable to save.');} finally {setBusy(false);}
 }
 function create(data:Record<string,unknown>) {
   for (const field of mod.fields) if (field.type === 'number' && data[field.name] !== undefined) data[field.name]=Number(data[field.name]);
   if (mod.area === 'care') { const {visitId,summary,...details}=data;return {visitId,summary,department:mod.key.toUpperCase(),details}; }
   if (data.amount !== undefined) {data.amountCents=Math.round(Number(data.amount)*100);delete data.amount;}
   if (data.expiresAt) data.expiresAt=new Date(String(data.expiresAt)).toISOString();
   if (data.incurredAt) data.incurredAt=new Date(String(data.incurredAt)+'T00:00:00').toISOString();
   if (data.scheduledAt) data.scheduledAt=new Date(String(data.scheduledAt)).toISOString();
   return data;
 }
 if (!mod) return <p>No additional modules are assigned to your role.</p>;
 const needsVisit = ['care','labs','prescriptions','invoices'].includes(mod.area);
 const visible = mod.area === 'care' ? rows.filter(r => r.department === mod.key.toUpperCase()) : rows;
 return <section className="operations">{!embeddedArea && <nav className="module-tabs" aria-label="Clinic departments">{available.map(m => <button type="button" className={mod.key===m.key?'selected':''} key={m.key} onClick={()=>setKey(m.key)}>{m.label}</button>)}</nav>}
 <div className="motion-page" key={mod.key}><div className="panel-heading"><div className="department-title"><h2>{mod.label}</h2>{busy && <span className="save-feedback" role="status"><span className="motion-spinner" aria-hidden="true" />Saving changes…</span>}</div>{mod.area !== 'reports' && <button className="quiet-button" disabled={busy || loading} aria-busy={loading} onClick={()=>void load()}>Refresh</button>}</div>
 {error && <p className="alert error" role="alert">{error}</p>}{notice && <p className="alert success" role="status">{notice}</p>}
 {mod.fields.length > 0 && canPerform(role,mod.area === 'care' ? 'care.'+mod.key : mod.area+'.create') && <form key={mod.key} className="panel form-grid module-form" onSubmit={e=>void submit(e,mod.area,create)}>
 {needsVisit && <label className="full">Visit<select name="visitId" required defaultValue=""><option value="" disabled>Select an active visit</option>{visits.filter(v=>!['CANCELLED','DISCHARGED'].includes(v.status)).map(v=><option value={v.id} key={v.id}>{v.visitNumber} — {v.patient.firstName} {v.patient.lastName}</option>)}</select></label>}
 {mod.area==='appointments' && <label>Patient<select name="patientId" required defaultValue=""><option value="" disabled>Select patient</option>{patients.map(p=><option value={p.id} key={p.id}>{p.patientNumber} — {p.firstName} {p.lastName}</option>)}</select></label>}
 {mod.fields.map(f=><label key={f.name}>{f.label}{f.options ? <select name={f.name}>{f.options.filter(o=>f.name!=='role' || role==='SUPER_ADMIN' || o!=='CLINIC_ADMIN').map(o=><option key={o}>{o}</option>)}</select> : f.type==='patient' ? <select name={f.name} defaultValue=""><option value="">No patient link (staff account)</option>{patients.map(p=><option key={p.id} value={p.id}>{p.patientNumber} — {p.firstName} {p.lastName}</option>)}</select> : f.type==='stock' ? <select name={f.name} required defaultValue=""><option value="" disabled>Select medicine batch</option>{stock.map(s=><option key={s.id} value={s.id}>{s.name} · {s.batch} · {s.quantity} in stock</option>)}</select> : f.type==='textarea' ? <textarea name={f.name} required={!f.optional} maxLength={4000}/> : <input name={f.name} type={f.type??'text'} required={!f.optional} min={f.min} max={f.max} step={f.step??(f.type==='number'?'1':undefined)} minLength={f.type==='password'?14:undefined} maxLength={f.type==='password'?72:500}/> }</label>)}
 <button className="wide-button" disabled={busy}>Save {mod.label.toLowerCase()}</button></form>}
 {mod.area==='invoices' && <p className="subtle">M-Pesa and bank payments are manually recorded receipts. No payment is initiated or verified with a provider.</p>}
 {mod.area==='reports' ? <Reports /> : loading ? <LoadingState label={`Loading ${mod.label.toLowerCase()}…`} /> : <div className="record-list">{visible.map(row=><article className="panel record" key={row.id}>
 <div><strong>{row.visit ? `${row.visit.patient.firstName} ${row.visit.patient.lastName} · ${row.visit.visitNumber}` : row.patient ? `${row.patient.firstName} ${row.patient.lastName}` : row.name ?? row.email ?? row.action}</strong><small>{date(row.createdAt ?? row.scheduledAt)}</small></div>
 {row.summary && <><p>{row.summary}</p>{Object.entries(row.details??{}).map(([k,v])=><p key={k}><b>{k}: </b>{String(v)}</p>)}</>}
 {row.testName && <p>{row.testName} · {row.status}{row.result && <><br/>{row.result}</>}</p>}
 {mod.area==='labs' && row.status==='REQUESTED' && canPerform(role,'labs.result') && <form className="inline-form" onSubmit={e=>void submit(e,`labs/${row.id}/result`)}><label>Final result<textarea name="result" required maxLength={10000}/></label><button disabled={busy} className="quiet-button">Save final result</button></form>}
 {mod.area==='stock' && <><p>Batch {row.batch} · {row.quantity} units · reorder at {row.reorderLevel} · expires {date(row.expiresAt)}</p>{(Number(row.quantity)<=Number(row.reorderLevel) || new Date(row.expiresAt!)<=new Date()) && <p className="alert error">Low stock or expired batch</p>}{canPerform(role,'stock.adjust') && <form className="inline-form" onSubmit={e=>void submit(e,`stock/${row.id}/movements`,d=>({...d,quantity:Number(d.quantity)}))}><label>Adjustment (+ received / − removed)<input name="quantity" type="number" step="1" required/></label><label>Reason<input name="reason" required maxLength={500}/></label><button className="quiet-button" disabled={busy}>Adjust stock</button></form>}</>}
 {mod.area==='movements' && <p>{row.stockItem?.name} · {row.quantity} units · {row.reason}</p>}
 {mod.area==='prescriptions' && <><p>{row.stockItem?.name} · {row.quantity} units</p><p>{row.instructions}</p>{row.dispensedAt ? <p>Dispensed {date(row.dispensedAt)}</p> : canPerform(role,'prescriptions.dispense') && <form onSubmit={e=>void submit(e,`prescriptions/${row.id}/dispense`)}><button className="quiet-button" disabled={busy}>Dispense prescription</button></form>}</>}
 {mod.area==='expenses' && <p>{row.description} · {currency(row.amountCents??0)} · {row.category}<br/>{date(row.incurredAt)} · {row.reference}</p>}
 {mod.area==='invoices' && <><p>{row.description} · {currency(row.amountCents??0)}</p><p>Balance: {currency((row.amountCents??0)-(row.payments??[]).reduce((n,p)=>n+p.amountCents,0))}</p><p>{(row.payments??[]).length} recorded payment(s)</p>{canPerform(role,'invoices.payment') && (row.amountCents??0)>(row.payments??[]).reduce((n,p)=>n+p.amountCents,0) && <form className="inline-form" onSubmit={e=>void submit(e,`invoices/${row.id}/payments`,d=>({amountCents:Math.round(Number(d.amount)*100),method:d.method,reference:d.reference}))}><label>Payment (KES)<input type="number" name="amount" required min="0.01" step="0.01"/></label><label>Method<select name="method"><option value="CASH">Cash</option><option value="MPESA_RECORDED">M-Pesa receipt (record only)</option><option value="BANK_RECORDED">Bank receipt (record only)</option></select></label><label>Unique receipt reference<input name="reference" required maxLength={100}/></label><button className="quiet-button" disabled={busy}>Record payment</button></form>}</>}
 {mod.area==='appointments' && <><p>{date(row.scheduledAt)} · {row.reason} · {row.status}</p>{row.status==='BOOKED' && canPerform(role,'appointments.update') && <div className="inline-form">{['ATTENDED','CANCELLED'].map(status=><form key={status} onSubmit={e=>void submit(e,`appointments/${row.id}/status`)}><input type="hidden" name="status" value={status}/><button className="quiet-button" disabled={busy}>Mark {status.toLowerCase()}</button></form>)}</div>}</>}
 {mod.area==='staff' && <><p>{row.firstName} {row.lastName} · {row.role} · {row.active?'Active':'Inactive'}</p>{row.id!==userId && row.role!=='SUPER_ADMIN' && row.role!=='PATIENT' && (role==='SUPER_ADMIN' || row.role!=='CLINIC_ADMIN') && <form className="inline-form" onSubmit={e=>void submit(e,`staff/${row.id}/role`)}><label>Assigned role<select name="role" defaultValue={row.role}>{STAFF_ROLES.filter(r=>role==='SUPER_ADMIN' || r!=='CLINIC_ADMIN').map(r=><option key={r} value={r}>{r.replaceAll('_',' ')}</option>)}</select></label><button className="quiet-button" disabled={busy}>Save role</button></form>}{row.id!==userId && row.active && row.role!=='SUPER_ADMIN' && <form onSubmit={e=>void submit(e,`staff/${row.id}/deactivate`)}><button className="quiet-button" disabled={busy}>Deactivate account</button></form>}</>}
 {mod.area==='audit' && <p>{row.user?.firstName} {row.user?.lastName} · {row.entityId}</p>}
 </article>)}{visible.length===0 && <p className="empty">No records yet.</p>}<p className="subtle">Showing up to {mod.area==='stock'?500:200} recent records.</p></div>}
 {mod.key === 'clinical' && CLINICIAN_ROLES.includes(role) && <Operations role={role} patients={patients} visits={visits} userId={userId} embeddedArea="prescriptions" />}
 </div></section>;
}
