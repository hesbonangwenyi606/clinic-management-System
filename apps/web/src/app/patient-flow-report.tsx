'use client';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';

type Person = {firstName:string;lastName:string};
type FlowVisit = {id:string;visitNumber:string;arrivedAt:string;status:string;patient:Person & {id:string;patientNumber:string};createdBy:Person;workflowEvents:{toStatus:string;changedAt:string;changedBy:Person}[];careEntries:{department:string;createdAt:string;author:Person}[]};
type Flow = {filters:{from:string;to:string;status:string|null};visits:FlowVisit[]};
const statuses=['REGISTERED','WAITING','IN_PROGRESS','REFERRED','ADMITTED','UNDER_OBSERVATION','COMPLETED','DISCHARGED','CANCELLED'];
const name=(p:Person)=>`${p.firstName} ${p.lastName}`;
const localDate=(date:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const dayNumber=(date:string)=>Math.floor(Date.parse(`${date}T00:00:00Z`)/86400000);
const dayString=(day:number)=>new Date(day*86400000).toISOString().slice(0,10);
const formatTime=(value:string)=>new Intl.DateTimeFormat('en-KE',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Nairobi'}).format(new Date(value));
async function download(flow:Flow) {
  const {jsPDF} = await import('jspdf');
  const pdf = new jsPDF({orientation:'landscape'});
  const width=pdf.internal.pageSize.getWidth();
  const pageHeight=pdf.internal.pageSize.getHeight();
  let y=18;
  function line(text:string, size=10, bold=false) {
    pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);
    const lines=pdf.splitTextToSize(text,width-32) as string[];
    for(const item of lines){if(y>pageHeight-17){pdf.addPage();y=18;}pdf.text(item,16,y);y+=size*0.48+2;}
  }
  line('Patient workflow report',18,true);
  line(`Visit arrivals: ${flow.filters.from} to ${flow.filters.to} | Nairobi time`,10);
  line(`Current status: ${flow.filters.status?.replaceAll('_',' ') ?? 'All statuses'} | Visits: ${flow.visits.length}`,10);
  line('Includes recorded status changes and care entries only.',9);y+=5;
  const columns=[14,53,82,130,160,208,253,283];
  function tableHeader(){
    pdf.setFillColor(26,74,117);pdf.rect(columns[0],y-5,columns[7]-columns[0],10,'F');
    pdf.setTextColor(255,255,255);pdf.setFont('helvetica','bold');pdf.setFontSize(8);
    ['Patient','Patient ID','Visit number','Current status','Recorded action','Date and time','Staff member'].forEach((title,i)=>pdf.text(title,columns[i]+2,y+1));
    pdf.setTextColor(30,40,50);y+=10;
  }
  function tableRow(cells:string[],index:number){
    pdf.setFont('helvetica','normal');pdf.setFontSize(8);
    const wrapped=cells.map((cell,i)=>pdf.splitTextToSize(cell,columns[i+1]-columns[i]-4) as string[]);
    const rowHeight=Math.max(10,Math.max(...wrapped.map(part=>part.length))*3.7+4);
    if(y+rowHeight>pageHeight-16){pdf.addPage();y=18;tableHeader();}
    if(index%2===0){pdf.setFillColor(245,249,253);pdf.rect(columns[0],y-4,columns[7]-columns[0],rowHeight,'F');}
    pdf.setDrawColor(220,230,239);pdf.line(columns[0],y+rowHeight-4,columns[7],y+rowHeight-4);
    wrapped.forEach((parts,i)=>pdf.text(parts,columns[i]+2,y+1));y+=rowHeight;
  }
  tableHeader();
  if(!flow.visits.length) tableRow(['No matching visits','','','','','',''],0);
  let rowIndex=0;
  for(const v of flow.visits){
    const events=[{when:v.arrivedAt,action:'Visit opened',person:v.createdBy},...v.workflowEvents.map(e=>({when:e.changedAt,action:`Status: ${e.toStatus.replaceAll('_',' ')}`,person:e.changedBy})),...v.careEntries.map(e=>({when:e.createdAt,action:`Care entry: ${e.department}`,person:e.author}))].sort((a,b)=>a.when.localeCompare(b.when));
    for(const event of events) tableRow([name(v.patient),v.patient.patientNumber,v.visitNumber,v.status.replaceAll('_',' '),event.action,formatTime(event.when),name(event.person)],rowIndex++);
  }
  const total=pdf.getNumberOfPages();for(let i=1;i<=total;i++){pdf.setPage(i);pdf.setFontSize(8);pdf.setTextColor(100);pdf.text(`Page ${i} of ${total}`,width-16,pageHeight-8,{align:'right'});}
  pdf.save(`patient-flow-${flow.filters.from}-${flow.filters.to}.pdf`);
}

export default function PatientFlowReport({active}:{active:boolean}) {
  const today=localDate(new Date());
  const [from,setFrom]=useState(()=>dayString(dayNumber(today)-6));const [to,setTo]=useState(today);const [status,setStatus]=useState('');
  const [flow,setFlow]=useState<Flow|null>(null);const [loading,setLoading]=useState(false);const [error,setError]=useState('');
  async function load(start:string,end:string,state:string,signal?:AbortSignal){
    setLoading(true);setError('');setFlow(null);
    try {const q=new URLSearchParams({from:start,to:end});if(state)q.set('status',state);const result=await api<Flow>(`/operations/patient-flow?${q}`,{signal});if(!signal?.aborted)setFlow(result);}
    catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:'Unable to load patient flow.');}finally{if(!signal?.aborted)setLoading(false);}
  }
  useEffect(()=>{if(!active)return;const controller=new AbortController();void load(from,to,status,controller.signal);return()=>controller.abort();},[active]);
  function apply(e:FormEvent){e.preventDefault();if(from>to){setError('Start date must be before the end date.');return;}void load(from,to,status);}
  const days=flow ? dayNumber(flow.filters.to)-dayNumber(flow.filters.from)+1 : 0;
  const bucketSize=days<=31?1:7;
  const buckets=flow?Array.from({length:Math.ceil(days/bucketSize)},(_,i)=>{const start=dayNumber(flow.filters.from)+i*bucketSize;const end=Math.min(start+bucketSize-1,dayNumber(flow.filters.to));const patients=new Set(flow.visits.filter(v=>{const d=dayNumber(localDate(new Date(v.arrivedAt)));return d>=start&&d<=end;}).map(v=>v.patient.id));return {start:dayString(start),end:dayString(end),count:patients.size};}):[];
  const highest=Math.max(1,...buckets.map(w=>w.count));
  const scale=Math.ceil(highest/5)*5;
  function preset(value:string){const end=localDate(new Date());const start=dayString(dayNumber(end)-(value==='7'?6:27));setFrom(start);setTo(end);void load(start,end,status);}
  return <section className="panel patient-flow"><div className="patient-flow-header"><div className="patient-flow-title"><span className="chart-symbol" aria-hidden="true"><i/><i/><i/></span><h2>Patient activity</h2></div><select aria-label="Quick date range" value="" onChange={e=>preset(e.target.value)} disabled={loading}><option value="" disabled>Quick range</option><option value="7">Last 7 days</option><option value="28">Last 28 days</option></select></div>
    <p className="patient-flow-description">Unique patients by visit arrival date, in Nairobi time.</p>
    <details className="patient-flow-options"><summary>Filters &amp; download</summary><form onSubmit={apply} className="patient-flow-filters"><label>From<input type="date" required value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" required value={to} onChange={e=>setTo(e.target.value)}/></label><label>Current visit status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{statuses.map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select></label><button className="wide-button" disabled={loading}>Apply</button></form><button type="button" className="quiet-button" disabled={!flow||loading} onClick={()=>flow&&download(flow)}>Download PDF report</button><p className="subtle">The report includes recorded visit status changes and care entries, with the staff member for each action.</p></details>
    {error && <p className="alert error" role="alert">{error}</p>}{loading && <p role="status">Loading patient activity...</p>}{flow && <><p className="patient-flow-period">{flow.filters.from} to {flow.filters.to}{flow.filters.status ? ` | ${flow.filters.status.replaceAll('_',' ')}` : ''}</p><div className="patient-flow-plot"><div className="patient-flow-axis" aria-hidden="true">{[5,4,3,2,1,0].map(n=><span key={n}>{scale*n/5}</span>)}</div><div className="patient-flow-chart" role="img" aria-label={buckets.map(w=>`${w.start}${w.end!==w.start?` to ${w.end}`:''}: ${w.count} patients`).join('; ')}>{buckets.map(w=><div className="patient-flow-bar" key={w.start}><div className="patient-flow-bar-track"><span title={`${w.count} patients`} style={{height:`${w.count/scale*100}%`}}/></div><small>{bucketSize===1 && days<=7 ? new Intl.DateTimeFormat('en-GB',{weekday:'short',timeZone:'UTC'}).format(new Date(`${w.start}T00:00:00Z`)) : w.start.slice(5)}{bucketSize>1 && <> <br/>to {w.end.slice(5)}</>}</small></div>)}</div></div></>}</section>;
}
