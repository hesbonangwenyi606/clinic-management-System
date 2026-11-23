'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { LoadingState } from '../components/motion';
import { api } from '../lib/api';

type Filters = { from: string; to: string; status: string; department: string; method: string };
type Report = {
  filters: { from: string | null; to: string | null; status: string | null; department: string | null; method: string | null; timezone: string };
  generatedAt: string; patients: number; patientsServed: number; billedCents: number; collectedCents: number; expensesCents: number; outstandingCents: number;
  labPending: number; appointments: number; visits: { status: string; _count: number }[];
  departments: { department: string; _count: number }[]; payments: { method: string; _sum: { amountCents: number } }[];
  drugUsage: { stockItemId: string; name: string; _sum: { quantity: number } }[];
  stockAlerts: { id: string; name: string; batch: string; quantity: number; expiresAt: string }[];
};
const empty: Filters = { from: '', to: '', status: '', department: '', method: '' };
const statuses = ['REGISTERED','WAITING','IN_PROGRESS','REFERRED','ADMITTED','UNDER_OBSERVATION','COMPLETED','DISCHARGED','CANCELLED'];
const departments = ['TRIAGE','CLINICAL','RECOVERY','CATERING'];
const methods = ['CASH','MPESA_RECORDED','BANK_RECORDED'];
const label = (value: string) => value.replaceAll('_', ' ');
const money = (value: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value / 100);
function today() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function exportReport(report: Report) {
  const rows: (string | number)[][] = [
    ['Clinic management report'], ['From', report.filters.from ?? 'All dates'], ['To', report.filters.to ?? 'All dates'],
    ['Timezone', report.filters.timezone], ['Generated', report.generatedAt],
    ['Visit status filter', report.filters.status ?? 'All'], ['Care department filter', report.filters.department ?? 'All'], ['Collection method filter', report.filters.method ?? 'All'],
    [], ['Metric', 'Value'], ['New registrations', report.patients], ['Patients served', report.patientsServed],
    ['Billed KES', report.billedCents / 100], ['Recorded collections KES', report.collectedCents / 100], ['Expenses KES', report.expensesCents / 100],
    ['Collections less expenses KES', (report.collectedCents - report.expensesCents) / 100], ['Outstanding all dates and methods KES', report.outstandingCents / 100],
    ['Pending lab tests requested in period', report.labPending], ['Booked appointments scheduled in period', report.appointments],
    [], ['Visit status', 'Visits'], ...report.visits.map(v => [label(v.status), v._count]),
    [], ['Recorded payment method', 'KES'], ...report.payments.map(p => [label(p.method), p._sum.amountCents / 100]),
    [], ['Care department', 'Entries'], ...report.departments.map(d => [label(d.department), d._count]),
    [], ['Dispensed medicine', 'Units'], ...report.drugUsage.map(d => [d.name, d._sum.quantity]),
    [], ['Current stock alerts (not date filtered)', 'Batch', 'Quantity', 'Expiry'], ...report.stockAlerts.map(s => [s.name, s.batch, s.quantity, s.expiresAt]),
  ];
  const csv = rows.map(row => row.map(value => {
    let text = String(value);
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `clinic-report-${report.filters.from ?? 'all'}-${report.filters.to ?? 'dates'}.csv`;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Reports({ active = true }: { active?: boolean }) {
  const [draft, setDraft] = useState<Filters>({ ...empty });
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const request = useRef(0);
  const applied = useRef<Filters>({ ...empty });
  const load = useCallback(async (filters: Filters) => {
    const id = ++request.current;
    if (filters.from && filters.to && filters.from > filters.to) { setError('From date must be on or before the to date.'); setLoading(false); return; }
    applied.current = filters;
    setLoading(true); setError('');
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key,value]) => { if (value) query.set(key,value); });
    try { const result = await api<Report>(`/operations/reports?${query}`); if (id === request.current) setReport(result); }
    catch (e) { if (id === request.current) setError(e instanceof Error ? e.message : 'Unable to load reports.'); }
    finally { if (id === request.current) setLoading(false); }
  }, []);
  useEffect(() => { if (active) void load(applied.current); return () => { request.current++; }; }, [active, load]);
  function apply(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void load(draft); }
  function preset(mode: 'today' | 'month' | 'all') {
    const date = today();
    const next = { ...empty, ...(mode === 'all' ? {} : { from: mode === 'today' ? date : `${date.slice(0,7)}-01`, to: date }) };
    setDraft(next); void load(next);
  }
  const period = report ? `${report.filters.from ?? 'Beginning'} → ${report.filters.to ?? 'Present'} · Africa/Nairobi` : '';
  const stats: [string,string | number][] = report ? [
    ['New registrations', report.patients], ['Patients served', report.patientsServed], ['Billed', money(report.billedCents)],
    ['Recorded collections', money(report.collectedCents)], ['Expenses', money(report.expensesCents)], ['Collections less expenses', money(report.collectedCents-report.expensesCents)],
    ['Outstanding · all dates & methods', money(report.outstandingCents)], ['Pending tests requested in period', report.labPending], ['Booked appointments in period', report.appointments],
  ] : [];
  return <section className="reports-view motion-page" aria-label="Clinic reports">
    <div className="panel-heading"><div><p className="eyebrow">MANAGEMENT OVERVIEW</p><h2>Reports & analytics</h2></div><button className="quiet-button" disabled={!report || loading || !!error} onClick={() => report && exportReport(report)}>Download CSV</button></div>
    <form onSubmit={apply} className="panel report-filters">
      <div className="report-presets"><span>Quick period</span><button type="button" className="quiet-button" onClick={()=>preset('today')} disabled={loading}>Today</button><button type="button" className="quiet-button" onClick={()=>preset('month')} disabled={loading}>This month</button><button type="button" className="quiet-button" onClick={()=>preset('all')} disabled={loading}>All dates / reset</button></div>
      <div className="report-filter-grid">
        <label>From date<input type="date" value={draft.from} max={draft.to || undefined} onChange={e=>setDraft({...draft,from:e.target.value})}/></label>
        <label>To date<input type="date" value={draft.to} min={draft.from || undefined} onChange={e=>setDraft({...draft,to:e.target.value})}/></label>
        <label>Visit status<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}><option value="">All visit statuses</option>{statuses.map(s=><option key={s} value={s}>{label(s)}</option>)}</select></label>
        <label>Care department<select value={draft.department} onChange={e=>setDraft({...draft,department:e.target.value})}><option value="">All care departments</option>{departments.map(d=><option key={d}>{d}</option>)}</select></label>
        <label>Collection method<select value={draft.method} onChange={e=>setDraft({...draft,method:e.target.value})}><option value="">All methods</option>{methods.map(m=><option key={m} value={m}>{label(m)}</option>)}</select></label>
        <button className="wide-button report-apply" disabled={loading} aria-busy={loading}>Apply filters</button>
      </div>
      <p className="subtle report-filter-note">Dates use Nairobi time. Visit status filters visits and patients served; care department filters care entries; collection method filters recorded collections. Outstanding balances and current stock alerts always cover all dates.</p>
    </form>
    {error && <p className="alert error" role="alert">{error}</p>}
    {loading && !report && <LoadingState label="Preparing your reports…"/>}
    {report && <>
      {loading && <p className="subtle" role="status">Updating report… Showing the previous results until the update finishes.</p>}
      <div className="report-period" role="status"><span>{period}{report.filters.status && ` · Visits: ${label(report.filters.status)}`}{report.filters.department && ` · Care: ${report.filters.department}`}{report.filters.method && ` · Collections: ${label(report.filters.method)}`}</span><small>Updated {new Date(report.generatedAt).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'})}</small></div>
      {error && <p className="subtle">Showing the last successfully loaded report. Its applied filters are displayed above.</p>}
      <div className="stats">{stats.map(([name,value])=><article className="stat-card" key={name}><span>{name}</span><strong>{value}</strong></article>)}</div>
      <div className="report-sections">
        <section className="panel"><h3>Visit workflow</h3>{report.visits.length ? report.visits.map(v=><p className="report-value" key={v.status}><span>{label(v.status)}</span><strong>{v._count}</strong></p>) : <p className="empty">No matching visits.</p>}</section>
        <section className="panel"><h3>Recorded collections by method</h3>{report.payments.length ? report.payments.map(p=><p className="report-value" key={p.method}><span>{label(p.method)}</span><strong>{money(p._sum.amountCents)}</strong></p>) : <p className="empty">No matching payments.</p>}</section>
        <section className="panel"><h3>Care entries by department</h3>{report.departments.length ? report.departments.map(d=><p className="report-value" key={d.department}><span>{d.department}</span><strong>{d._count}</strong></p>) : <p className="empty">No matching care entries.</p>}</section>
        <section className="panel"><h3>Dispensed medicine usage</h3>{report.drugUsage.length ? report.drugUsage.map(d=><p className="report-value" key={d.stockItemId}><span>{d.name}</span><strong>{d._sum.quantity} units</strong></p>) : <p className="empty">No dispensing in this period.</p>}</section>
      </div>
      <section className="panel report-stock"><h3>Current low stock / expiry within 30 days</h3><p className="subtle">Current inventory, independent of the selected reporting period.</p>{report.stockAlerts.length ? <div className="table-wrap"><table><thead><tr><th>Medicine</th><th>Batch</th><th>Remaining</th><th>Expiry</th></tr></thead><tbody>{report.stockAlerts.map(s=><tr key={s.id}><td>{s.name}</td><td>{s.batch}</td><td>{s.quantity}</td><td>{new Date(s.expiresAt).toLocaleDateString('en-KE',{timeZone:'Africa/Nairobi'})}</td></tr>)}</tbody></table></div> : <p className="empty">No current stock alerts.</p>}</section>
    </>}
  </section>;
}
