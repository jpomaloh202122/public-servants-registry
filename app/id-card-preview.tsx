'use client';
import {useEffect,useRef,useState} from 'react';
import {Download,RefreshCw,ShieldCheck,X} from 'lucide-react';
import {PassDesign} from './pass-design';
import type {IdCard} from './id-card';
class CardRequestError extends Error {
 constructor(message:string,readonly checks:string[]=[]){super(message);}
}
async function resultCard(response:Response):Promise<IdCard> {
 const result=await response.json();
 if(!response.ok)throw new CardRequestError(result.error||'The card could not be prepared.',Array.isArray(result.checks)?result.checks:[]);
 return result;
}
async function readCard(number:string,signal?:AbortSignal) {
 return resultCard(await fetch('/api/id-card?'+new URLSearchParams({employeeNumber:number}),{cache:'no-store',signal}));
}
async function asset(path:string) {
 const response=await fetch(path);
 if(!response.ok)throw Error('The card branding could not be loaded.');
 const bytes=new Uint8Array(await response.arrayBuffer());
 let binary='';
 for(let index=0;index<bytes.length;index+=32768)binary+=String.fromCharCode(...bytes.subarray(index,index+32768));
 return btoa(binary);
}
async function portraitForPrint(url:string) {
 const image=new Image();
 image.src=url;
 await image.decode();
 const canvas=document.createElement('canvas');
 canvas.width=360;canvas.height=480;
 const ctx=canvas.getContext('2d');
 if(!ctx)throw Error('The portrait could not be prepared for printing.');
 const scale=Math.max(360/image.naturalWidth,480/image.naturalHeight);
 const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
 ctx.fillStyle='#fff';ctx.fillRect(0,0,360,480);
 ctx.drawImage(image,(360-width)/2,(480-height)/2,width,height);
 return canvas.toDataURL('image/jpeg',0.94);
}
export default function IdCardPreview({number,onClose,onReview,onIssued}:{number:string;onClose:()=>void;onReview?:()=>void;onIssued?:()=>void}) {
 const [wallet,setWallet]=useState(false);
 const alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const dialog=useRef<HTMLDialogElement>(null);
 const [card,setCard]=useState<IdCard|null>(null);
 const [error,setError]=useState('');
 const [checks,setChecks]=useState<string[]>([]);
 const [busy,setBusy]=useState('');
 const [retry,setRetry]=useState(0);
 function showError(error:unknown) {
  setError((error as Error).message);setChecks(error instanceof CardRequestError?error.checks:[]);
 }
 useEffect(()=>{
  dialog.current?.showModal();const controller=new AbortController();
  readCard(number,controller.signal).then(result=>{if(!controller.signal.aborted)setCard(result);}).catch(error=>{
   if(!controller.signal.aborted)showError(error);
  });
  return()=>controller.abort();
 },[number,retry]);
 async function issue() {
  if(!card||!window.confirm('Issue a Public Servant ID for '+card.name+' ('+card.employeeNumber+')? Anyone scanning its QR code can view the five printed identity fields.'))return;
  setBusy('Issuing ID…');setError('');setChecks([]);
  try {
   const issued=await resultCard(await fetch('/api/id-card',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({employeeNumber:number,datasetId:card.datasetId,revision:card.revision,confirmIssue:true})}));
   if(alive.current){setCard(issued);onIssued?.();}
  }catch(error){showError(error);}
  finally{setBusy('');}
 }
 async function download() {
  setBusy('Preparing card…');setError('');setChecks([]);
  try {
   const current=await readCard(number);
   const [logo,font,bold,lib,portrait]=await Promise.all([
    asset('/png-state-emblem.png'),asset('/report-fonts/DejaVuSans.ttf'),asset('/report-fonts/DejaVuSans-Bold.ttf'),import('./id-card-pdf'),portraitForPrint(current.photoUrl)
   ]);
   const pdf=lib.makeIdCardPdf(current,{logo:'data:image/png;base64,'+logo,font,bold,portrait});
   const latest=await readCard(number);
   if(latest.datasetId!==current.datasetId||latest.revision!==current.revision||latest.cardId!==current.cardId)
    throw Error('The registry changed while preparing the PDF. Recheck and retry.');
   if(!alive.current)return;
   pdf.save('PSPASS_'+number.replace(/[^A-Za-z0-9_-]/g,'_')+'_'+current.status+'.pdf');setCard(latest);
  }catch(error){showError(error);}
  finally{setBusy('');}
 }
 return <dialog ref={dialog} className="id-card-dialog" aria-labelledby="id-card-title" onCancel={event=>{event.preventDefault();onClose();}}>
  <div className="id-card-heading"><div><div className="eyebrow">GOVERNMENT OF PNG PUBLIC SERVANTS REGISTRY SYSTEM</div><h2 id="id-card-title">Public Servant ID</h2></div>
   <button className="btn icon" aria-label="Close ID card preview" onClick={onClose}><X size={20}/></button></div>
  <p className="id-card-note">{card?.status==='issued'?'Issued in the registry. Scan the QR code to check the current ID record.':
   'Review the saved employee checks, then approve issuance. SevisWallet credential delivery follows the partner integration.'}</p>
  {!card&&!error&&<p role="status">Checking payroll, record completeness and the verified portrait…</p>}
  {card&&<>
   <div className="id-card-buttons" role="group" aria-label="ID format">
    <button type="button" className={'btn'+(!wallet?' primary':'')} aria-pressed={!wallet} onClick={()=>setWallet(false)}>Physical pass</button>
    <button type="button" className={'btn'+(wallet?' primary':'')} aria-pressed={wallet} onClick={()=>setWallet(true)}>Digital ID</button>
   </div>
   <div className="id-card-board"><PassDesign card={card} wallet={wallet}/></div>
   <div className="card-evidence"><img src={card.photoUrl} alt="Saved verified portrait"/><div><b>Verified portrait on file</b>
    <p>Employee {card.employeeNumber} · Payroll period {card.payrollCycle??'Not recorded'} · Revision {card.revision}</p>
    <p>{card.status==='issued'?'Registry ID '+card.cardId:card.needsReplacement?'The earlier ID requires replacement after record changes.':'Awaiting issuance approval.'}</p>
    {!card.issuanceAvailable&&<p>Install the issued-card database setup to enable issuance.</p>}</div></div>
  </>}
  {error&&<div role="alert" className="form-error id-card-error"><p>{error}</p>{checks.length>0&&<ul>{checks.map(check=><li key={check}>{check}</li>)}</ul>}</div>}
  <div className="id-card-buttons">
   {onReview&&<button className="btn" disabled={!!busy} onClick={onReview}>Review employee record</button>}
   <button className="btn" disabled={!!busy} onClick={()=>{setCard(null);setError('');setChecks([]);setRetry(value=>value+1);}}><RefreshCw size={16}/>Recheck</button>
   {card&&card.status!=='issued'&&<button className="btn primary" disabled={!!busy||!card.issuanceAvailable} onClick={issue}><ShieldCheck size={16}/>{card.needsReplacement?'Issue replacement ID':'Approve and issue ID'}</button>}
   <button className="btn" disabled={!card||!!busy} onClick={download}><Download size={16}/>{busy||('Download '+(card?.status==='issued'?'issued pass':'pass preview')+' PDF')}</button>
  </div>
 </dialog>;
}
