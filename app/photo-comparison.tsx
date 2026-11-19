'use client';
import {useEffect,useRef,useState} from 'react';
type Result={error?:string;manual?:boolean;reviewId?:string;portrait?:string;person?:{
 name:string;department:string;position:string;employeeNumber:string;cardStatus:string
}};

export default function PhotoComparison({issuedCardLink=''}:{issuedCardLink?:string}){
 const [claim,setClaim]=useState(issuedCardLink),[purpose,setPurpose]=useState('ID presentation'),[consent,setConsent]=useState(false);
 const [file,setFile]=useState<Blob|null>(null),[preview,setPreview]=useState(''),[stream,setStream]=useState<MediaStream|null>(null);
 const [result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const video=useRef<HTMLVideoElement>(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(!stream)return;if(video.current)video.current.srcObject=stream;return()=>stream.getTracks().forEach(t=>t.stop());},[stream]);
 useEffect(()=>{if(!file){setPreview('');return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
 async function camera(){
  setError('');setBusy(true);
  try{const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:1000}}});
   if(!alive.current){media.getTracks().forEach(t=>t.stop());return;}
   setFile(null);setStream(media);
  }catch{setError('Camera unavailable. Allow camera access or choose a JPEG or PNG.');}finally{setBusy(false);}
 }
 function capture(){
  const v=video.current;if(!v?.videoWidth)return;
  const c=document.createElement('canvas');c.width=Math.min(v.videoWidth,1000);c.height=Math.round(c.width*v.videoHeight/v.videoWidth);
  c.getContext('2d')?.drawImage(v,0,0,c.width,c.height);
  c.toBlob(blob=>{if(!blob){setError('Capture failed. Please retry.');return;}setFile(blob);setStream(null);},'image/jpeg',0.85);
 }
 async function submit(confirm:boolean){
  if(busy)return;setBusy(true);setError('');
  try{
   const options:RequestInit=confirm?{headers:{'Content-Type':'application/json'},body:JSON.stringify({reviewId:result?.reviewId})}:
    {headers:{'Content-Type':'application/octet-stream','x-check-purpose':purpose,'x-pilot-consent':consent?'yes':'no','x-registry-claim':encodeURIComponent(claim.trim())},body:file};
   const response=await fetch('/api/photo-comparison',{...options,method:'POST',cache:'no-store'});
   const data:Result=await response.json();if(!response.ok)throw Error(data.error||'Comparison unavailable.');
   setResult(data);if(!data.reviewId)setFile(null);
  }catch(e){setError(e instanceof Error?e.message:'Comparison unavailable.');}finally{setBusy(false);}
 }
 function reset(){setFile(null);setStream(null);setConsent(false);setClaim(issuedCardLink);setError('');setResult(null);}
 return <section className="panel photo-check"><h2>Supervised photo comparison</h2>
 <p>Compare one consenting pilot participant with their verified registry portrait. A camera still or uploaded photo cannot confirm liveness.</p>
 {!result&&<fieldset disabled={busy}><label>Employee Number or issued-card QR link<input value={claim} maxLength={512} onChange={e=>setClaim(e.target.value)} placeholder="Enter Employee Number or scan a QR link"/></label>
 <label>Purpose<select value={purpose} onChange={e=>setPurpose(e.target.value)}><option>ID presentation</option><option>Employee record check</option></select></label>
 <label className="photo-consent"><input type="checkbox" checked={consent} onChange={e=>{setConsent(e.target.checked);setStream(null);setFile(null);}}/>The participant agreed to this pilot comparison and Sydney processing.</label>
 {consent&&<><div className="photo-actions">{stream?<><button className="btn" onClick={capture}>Take photo</button><button className="btn" onClick={()=>setStream(null)}>Close camera</button></>:<button className="btn" onClick={camera}>Open camera</button>}
 <label>Or choose a photo (JPEG or PNG, up to 3 MB)<input type="file" accept="image/jpeg,image/png" onChange={e=>{const f=e.target.files?.[0];setStream(null);setError('');if(!f||f.size>3*1024*1024){setFile(null);if(f)setError('Choose a photo of 3 MB or less.');}else setFile(f);}}/></label></div>
 {stream&&<video ref={video} autoPlay muted playsInline/>}{preview&&!stream&&<img src={preview} alt="Photo selected for comparison"/>}
 <button className="btn primary" disabled={!file||!!stream||!claim.trim()} onClick={()=>submit(false)}>Compare photos</button></>}
 </fieldset>}
 {result?.manual&&<p role="status">Manual check required. Check the ID with the participant or retry with one clear, front-facing photo.</p>}
 {result?.reviewId&&<><h3>Officer review</h3><p>Compare the two portraits and the ID presented. Confirm only if they identify the same person.</p>
 <div className="photo-actions"><figure><img src={preview} alt="Submitted portrait"/><figcaption>Submitted photo</figcaption></figure><figure><img src={result.portrait} alt="Verified registry portrait"/><figcaption>Registry portrait</figcaption></figure></div>
 <button className="btn primary" disabled={busy} onClick={()=>submit(true)}>Confirm and view record</button></>}
 {result?.person&&<><h3>{result.person.name}</h3><dl>{[['Employee Number',result.person.employeeNumber],['Department',result.person.department],['Position',result.person.position],['Public Servant ID',result.person.cardStatus]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><p>Officer-confirmed photo comparison. Presence unverified.</p></>}
 {busy&&<p role="status">Please wait…</p>}{error&&<p role="alert">{error}</p>}
 {result&&<button className="btn" onClick={reset} disabled={busy}>Close and start again</button>}
 </section>;
}
