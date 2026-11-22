'use client';
import {useEffect,useState,type FormEvent} from 'react';
import './access.css';
const labels={first:'First name',last:'Last name',gender:'Gender',dob:'Date of birth',position:'Position'};
type Row=Record<keyof typeof labels,string>&{number:string;hasPhoto:boolean};
type Result={employees:Row[];agency:string;revision:number;dataset:string;more:boolean};
export default function HRWorkspace({role,edit}:{role:string;edit:boolean}){
 const [query,setQuery]=useState(''),[page,setPage]=useState(0),[refresh,setRefresh]=useState(0);
 const [data,setData]=useState<Result>(),[employee,select]=useState<Row>(),[message,notify]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{
  const ctl=new AbortController();setData(undefined);select(undefined);
  const timer=setTimeout(async()=>{try{
   const res=await fetch('/api/agency-hr?'+new URLSearchParams({q:query,page:String(page)}),{signal:ctl.signal});
   const body=await res.json();if(!res.ok)throw Error(body.error);setData(body);
  }catch(e){if(!ctl.signal.aborted)notify((e as Error).message);}},180);
  return ()=>{clearTimeout(timer);ctl.abort();};
 },[query,page,refresh]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!employee||!data)return;setBusy(true);
  const form=new FormData(event.currentTarget);form.set('employeeNumber',employee.number);form.set('revision',String(data.revision));form.set('dataset',data.dataset);
  try{const res=await fetch('/api/agency-hr',{method:'POST',body:form});const result=await res.json();if(!res.ok)throw Error(result.error);
   notify('Employee record saved.');setRefresh(r=>r+1);
  }catch(e){notify((e as Error).message);}finally{setBusy(false);}
 }
 return <main className="access-workspace"><header><div><small>{role}</small><h1>{data?.agency||'Agency employees'}</h1></div><a href="/auth/logout">Sign out</a></header>
 <label>Find an employee<input value={query} placeholder="Name or employee number" onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>
 <p role="status">{message}</p>{data?<><section><table><thead><tr><th>Employee number</th><th>Name</th><th>Position</th><th/></tr></thead><tbody>{data.employees.map(e=><tr key={e.number}><td>{e.number}</td><td>{e.first} {e.last}</td><td>{e.position}</td><td><button onClick={()=>select(e)}>{edit?'Review / correct':'View'}</button></td></tr>)}</tbody></table>{!data.employees.length&&<p>No matching employees.</p>}
 <button disabled={!page} onClick={()=>setPage(page-1)}>Previous</button> Page {page+1} <button disabled={!data.more} onClick={()=>setPage(page+1)}>Next</button></section>
 {employee&&<section><h2>{employee.first} {employee.last} · {employee.number}</h2>{employee.hasPhoto&&<img width="100" alt="Employee portrait" src={'/api/agency-hr?portrait='+encodeURIComponent(employee.number)+'&rev='+data.revision}/>}
 <form key={employee.number} onSubmit={submit}>{Object.entries(labels).map(([k,label])=><label key={k}>{label}<input name={k} readOnly={!edit} defaultValue={employee[k as keyof typeof labels]} type={k==='dob'?'date':'text'} maxLength={200}/></label>)}
 {edit&&<><label>Passport-style portrait (JPG or PNG, up to 5 MB)<input name="file" type="file" accept="image/jpeg,image/png"/></label><button disabled={busy}>Save corrections</button></>}</form></section>}</>:<p>Loading agency records…</p>}</main>;
}
