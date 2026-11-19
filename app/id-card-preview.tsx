'use client';
import {useEffect,useRef,useState} from 'react';
import {Download,RefreshCw,X} from 'lucide-react';
import type {IdCard} from './id-card';

async function readCard(number:string,signal?:AbortSignal):Promise<IdCard> {
 const response=await fetch('/api/id-card?'+new URLSearchParams({employeeNumber:number}),{cache:'no-store',signal});
 const result=await response.json();
 if(!response.ok)throw Error(result.error||'The card could not be prepared.');
 return result;
}
async function asset(path:string) {
 const response=await fetch(path,{cache:'no-store'});
 if(!response.ok)throw Error('The card image or branding could not be loaded.');
 const bytes=new Uint8Array(await response.arrayBuffer());
 let binary='';
 for(let index=0;index<bytes.length;index+=32768)binary+=String.fromCharCode(...bytes.subarray(index,index+32768));
 return btoa(binary);
}
export default function IdCardPreview({number,onClose}:{number:string;onClose:()=>void}) {
 const alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const dialog=useRef<HTMLDialogElement>(null);
 const [card,setCard]=useState<IdCard|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  dialog.current?.showModal();
  const controller=new AbortController();
  setCard(null);setError('');
  readCard(number,controller.signal).then(result=>{if(!controller.signal.aborted)setCard(result);}).catch(error=>{
   if(!controller.signal.aborted)setError(error.message);
  });
  return()=>controller.abort();
 },[number,retry]);
 async function download() {
  setBusy(true);setError('');
  try {
   // Read saved data again rather than exporting an earlier modal snapshot.
   const current=await readCard(number);
   const [logo,photo,font,bold,lib]=await Promise.all([
    asset('/gpo-emblem-transparent.png'),asset(current.photoUrl),
    asset('/report-fonts/DejaVuSans.ttf'),asset('/report-fonts/DejaVuSans-Bold.ttf'),import('./id-card-pdf')
   ]);
   const pdf=lib.makeIdCardPdf(current,{logo:'data:image/png;base64,'+logo,photo:'data:image/png;base64,'+photo,font,bold});
   const latest=await readCard(number);
   if(latest.datasetId!==current.datasetId||latest.revision!==current.revision)
    throw Error('The registry changed while preparing the PDF. Reload and retry.');
   if(!alive.current)return;
   pdf.save('PSPASS_'+number.replace(/[^A-Za-z0-9_-]/g,'_')+'_preview.pdf');
   setCard(latest);
  }catch(error){setError((error as Error).message);}
  finally{setBusy(false);}
 }
 return <dialog ref={dialog} className="id-card-dialog" aria-labelledby="id-card-title" onCancel={event=>{event.preventDefault();onClose();}}>
  <div className="id-card-heading">
   <div><div className="eyebrow">SEVISPASS PREPARATION</div><h2 id="id-card-title">Public Servant Digital ID</h2></div>
   <button className="btn icon" aria-label="Close ID card preview" onClick={onClose}><X size={20}/></button>
  </div>
  <p className="id-card-note">Prepared from the saved registry record. Issuance approval and SevisWallet credential creation follow the SevisPass process.</p>
  {!card&&!error&&<p role="status">Checking the employee’s current payroll status and readiness…</p>}
  {card&&<div className="id-card-board">
   <section aria-label="Front of ID card" className="ps-card ps-card-front">
    <header><img className="ps-card-emblem" src="/gpo-emblem-transparent.png" alt="Government Payroll Office"/>
     <div><span>GOVERNMENT OF PAPUA NEW GUINEA</span><strong>Public Servant Digital ID</strong></div></header>
    <div className="ps-card-body">
     <img className="ps-card-photo" src={card.photoUrl} alt="Verified registry portrait"/>
     <div className="ps-card-identity"><h3 title={card.name}>{card.name}</h3>
      <span>EMPLOYEE NUMBER</span><strong title={card.employeeNumber}>{card.employeeNumber}</strong>
      <span>AGENCY CODE</span><b title={card.agencyCode}>{card.agencyCode}</b></div>
    </div><footer>PREVIEW · AWAITING ISSUANCE APPROVAL</footer>
   </section>
   <section aria-label="Back of ID card" className="ps-card ps-card-back">
    <header><div><strong>Government Payroll Office</strong><span>Registry review details</span></div></header>
    <div className="ps-card-details">
     <span>AGENCY / DEPARTMENT</span><strong title={card.agency}>{card.agency}</strong>
     <span>POSITION</span><p title={card.position}>{card.position}</p>
     <b className="ps-card-ready">Registry readiness checks met</b>
     <small>Payroll period {card.payrollCycle??'Not recorded'} · Revision {card.revision}</small>
     <small>Assessed {card.assessedOn}</small>
    </div><footer>PREVIEW · AWAITING ISSUANCE APPROVAL</footer>
   </section>
  </div>}
  {error&&<p role="alert" className="form-error id-card-error">{error}</p>}
  <div className="id-card-buttons">
   <button className="btn" disabled={busy} onClick={()=>setRetry(value=>value+1)}><RefreshCw size={16}/>Recheck record</button>
   <button className="btn primary" disabled={!card||busy} onClick={download}><Download size={16}/>{busy?'Preparing card…':'Download preview PDF'}</button>
  </div>
 </dialog>;
}
