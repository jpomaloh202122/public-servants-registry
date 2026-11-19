'use client';
import {useEffect,useState} from 'react';
import {Search,RefreshCw,CreditCard,ChevronLeft,ChevronRight} from 'lucide-react';
type Card={id:string;employeeNumber:string;issuedAt:string;name:string;agency:string;position:string;gender:string};
type Result={installed:boolean;issued:number;matched:number;page:number;limit:number;cards:Card[]};
export default function IssuedCards({onOpen,revision}:{onOpen:(number:string)=>void;revision:number}) {
 const [query,setQuery]=useState(''),[page,setPage]=useState(0),[retry,setRetry]=useState(0);
 const [result,setResult]=useState<Result|null>(null),[error,setError]=useState('');
 const scope=JSON.stringify([query,page,retry,revision]);
 const [loadedScope,setLoadedScope]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  const timer=setTimeout(()=>{
   fetch('/api/id-cards?'+new URLSearchParams({query,page:String(page)}),{cache:'no-store',signal:controller.signal})
    .then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'Issued IDs could not be loaded.');return data as Result;})
    .then(data=>{if(!controller.signal.aborted){setResult(data);setError('');setLoadedScope(scope);}})
    .catch(error=>{if(!controller.signal.aborted){setError(error.message);setLoadedScope(scope);}});
  },180);
  return()=>{clearTimeout(timer);controller.abort();};
 },[query,page,retry,revision,scope]);
 const current=loadedScope===scope;
 return <section className="panel employee-panel">
  <div className="panel-head"><div><h2>Issued Public Servant IDs <span className="count">{current&&!error?result?.issued.toLocaleString():'—'}</span></h2>
   <p>Latest recorded issuances. Replaced and revoked cards are excluded. Open a card or scan its QR to check current validity.</p></div>
   <button className="btn" onClick={()=>setRetry(value=>value+1)}><RefreshCw size={16}/>Refresh issued IDs</button></div>
  <div className="register-filters"><div className="search"><Search size={17}/><input aria-label="Search issued IDs" placeholder="Search issued name or Employee Number…" value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}}/></div></div>
  {!current&&<p className="issued-message" role="status">Loading issued IDs…</p>}
  {current&&error&&<p className="issued-message form-error" role="alert">{error}</p>}
  {current&&!error&&result&&!result.installed&&<p className="issued-message">Issued-card storage is not installed. Complete the database setup before issuing IDs.</p>}
  {current&&!error&&result?.installed&&<>
   <div className="table-scroll"><table><thead><tr><th>EMPLOYEE</th><th>EMPLOYEE NUMBER</th><th>DEPARTMENT</th><th>POSITION</th><th>ISSUED · PNG TIME</th><th>REGISTRY ID</th><th/></tr></thead><tbody>
    {result.cards.map(card=><tr key={card.id}><td><b>{card.name}</b></td><td className="mono">{card.employeeNumber}</td><td>{card.agency}</td><td>{card.position}</td>
     <td>{new Date(card.issuedAt).toLocaleString('en-PG',{timeZone:'Pacific/Port_Moresby'})}</td><td className="mono issued-card-id">{card.id}</td>
     <td><button className="btn" aria-label={'Open issued ID for '+card.employeeNumber} onClick={()=>onOpen(card.employeeNumber)}><CreditCard size={16}/>Open card</button></td></tr>)}
   </tbody></table>{!result.cards.length&&<div className="empty"><CreditCard size={28}/><h3>{query?'No matching issued IDs':'No IDs issued yet'}</h3><p>{query?'Try another name or Employee Number.':'Approve an eligible employee’s card to record the first issuance.'}</p></div>}</div>
   <div className="table-footer"><span>{result.matched?Math.min(page*result.limit+1,result.matched):0}–{Math.min((page+1)*result.limit,result.matched)} of {result.matched.toLocaleString()} issued IDs</span><div>
    <button className="btn icon" aria-label="Previous issued IDs page" disabled={page===0} onClick={()=>setPage(value=>value-1)}><ChevronLeft size={16}/></button><span>{page+1}</span>
    <button className="btn icon" aria-label="Next issued IDs page" disabled={(page+1)*result.limit>=result.matched} onClick={()=>setPage(value=>value+1)}><ChevronRight size={16}/></button>
   </div></div>
  </>}
 </section>;
}
