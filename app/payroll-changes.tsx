'use client';
import {useEffect,useState} from 'react';

type Change={number:string;previous_agency:string;current_agency:string|null;previous_position:string;current_position:string|null;previous_status:string;current_status:string|null};
export default function PayrollChanges({revision,onConfirmed}:{revision:number;onConfirmed:()=>void}){
 const [result,setResult]=useState<{available:boolean;changes:Change[];next:string|null}|null>(null);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 async function load(after=''){
  setBusy(true);setError('');
  try{const r=await fetch('/api/payroll-changes?after='+encodeURIComponent(after),{cache:'no-store'});if(!r.ok)throw Error('Payroll changes could not be loaded.');setResult(await r.json());}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 useEffect(()=>{void load();},[revision]);
 async function confirm(){
  if(!window.confirm('Confirm all employees in the active source are on the current payroll cycle? Identity verification is recorded separately.'))return;
  setBusy(true);setError('');setMessage('');
  try{
   const state=await fetch('/api/source-confirmation?summary=0',{cache:'no-store'});
   if(!state.ok)throw Error('Could not identify the active payroll source.');
   const {dataset,revision:currentRevision}=await state.json();
   const response=await fetch('/api/source-confirmation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataset,revision:currentRevision,confirmActive:true})});
   if(!response.ok)throw Error('Payroll confirmation failed. Refresh and check the active source.');
   setMessage('Current payroll activity confirmed. Photo and record verification are tracked separately.');onConfirmed();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="panel"><div className="panel-head"><div><h2>Payroll cycle changes</h2><p>Review changes before updating PSPASS. An absent record requires follow-up to establish the reason.</p></div><button className="btn" disabled={busy} onClick={confirm}>Confirm current payroll activity</button></div>
 {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
 {result&&!result.available&&<p>Cycle comparison starts with the next source activation.</p>}
 {result?.available&&<><div className="table-scroll"><table><thead><tr><th>Employee number</th><th>Payroll status</th><th>Position</th><th>Organisation</th></tr></thead><tbody>{result.changes.map(c=><tr key={c.number}><td>{c.number}</td><td>{c.current_status===null?'Missing from current cycle — review':c.previous_status+' → '+c.current_status}</td><td>{c.previous_position} → {c.current_position??'—'}</td><td>{c.previous_agency} → {c.current_agency??'—'}</td></tr>)}</tbody></table></div>
 {!result.changes.length&&<p>No payroll status, position or organisation changes found.</p>}{result.next&&<button className="btn" disabled={busy} onClick={()=>load(result.next!)}>Next changes</button>}<button className="btn" disabled={busy} onClick={()=>load()}>Refresh changes</button></>}
 </section>;
}
