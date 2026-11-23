'use client';
import {useEffect,useRef,useState} from 'react';
import {api} from '../lib/api';

type Row={id:string;patientNumber?:string;firstName?:string;lastName?:string;visitNumber?:string;name?:string;batch?:string;quantity?:number;patient?:{firstName:string;lastName:string}};

export default function RecordPicker({kind,name,label}:{kind:'patients'|'visits'|'stock';name:string;label:string}) {
  const [search,setSearch]=useState(''),[page,setPage]=useState(1),[rows,setRows]=useState<Row[]>([]),[selected,setSelected]=useState<Row|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const request=useRef(0);
  const describe=(row:Row)=>kind==='patients'?`${row.patientNumber} — ${row.firstName} ${row.lastName}`:kind==='visits'?`${row.visitNumber} — ${row.patient?.firstName} ${row.patient?.lastName}`:`${row.name} · ${row.batch} · ${row.quantity} units`;
  useEffect(()=>{
    const id=++request.current;setLoading(true);
    const timeout=window.setTimeout(async()=>{
      try{
        const query=new URLSearchParams({search,page:String(page),pageSize:'25',...(kind==='visits'?{status:'OPEN'}:kind==='stock'?{status:'AVAILABLE'}:{})});
        const result=await api<Row[]|{items:Row[]}>(`${kind==='stock'?'/operations/stock':'/'+kind}?${query}`);
        if(id===request.current){setRows(Array.isArray(result)?result:result.items);setError('');}
      }catch(e){if(id===request.current){setRows([]);setError(e instanceof Error?e.message:'Search failed.');}}
      finally{if(id===request.current)setLoading(false);}
    },search ? 250 : 0);
    return ()=>{window.clearTimeout(timeout);request.current++;};
  },[kind,search,page]);
  const options=selected&&!rows.some(r=>r.id===selected.id)?[selected,...rows]:rows;
  return <div className="full record-picker"><label>Search {label.toLowerCase()}<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Name or number"/></label><label>{label}<select name={name} required value={selected?.id??''} onChange={e=>setSelected(options.find(r=>r.id===e.target.value)??null)}><option value="">{loading?'Searching…':'Select '+label.toLowerCase()}</option>{options.map(r=><option key={r.id} value={r.id}>{describe(r)}</option>)}</select></label><div className="inline-form"><button type="button" className="quiet-button" disabled={page===1||loading} onClick={()=>setPage(p=>p-1)}>Previous</button><small>Page {page}</small><button type="button" className="quiet-button" disabled={rows.length<25||loading} onClick={()=>setPage(p=>p+1)}>Next</button></div>{error&&<p className="alert error" role="alert">{error}</p>}</div>;
}
