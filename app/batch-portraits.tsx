'use client';
import {useEffect,useRef,useState} from 'react';
import {numberFromPhoto,portraitWidth,portraitHeight,portraitCrop} from './batch-portrait-model';

type Row={file:File;number:string;name?:string;stamp?:string;existing?:boolean;crop?:Blob;url?:string;selected:boolean;message:string;saved?:boolean};
async function cropPhoto(file:File){
 if(file.size>50*1024*1024)throw Error('Source photo exceeds 50 MB.');
 const header=new Uint8Array(await file.slice(0,8).arrayBuffer());
 const jpeg=header[0]===255&&header[1]===216&&header[2]===255;
 const png=[137,80,78,71,13,10,26,10].every((v,i)=>header[i]===v);
 if(!jpeg&&!png)throw Error('Choose a JPEG or PNG photo.');
 const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
 try{
  const {x,y,w,h}=portraitCrop(bitmap.width,bitmap.height);
  const canvas=document.createElement('canvas');canvas.width=portraitWidth;canvas.height=portraitHeight;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Photo preview unavailable.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bitmap,x,y,w,h,0,0,canvas.width,canvas.height);
  return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Crop failed.')),'image/jpeg',0.94));
 }finally{bitmap.close();}
}
async function request(row:Row,save=false){
 const headers:Record<string,string>={'x-photo-action':save?'save':'preview','x-photo-filename':encodeURIComponent(row.file.name)};
 if(save){headers['Content-Type']='image/jpeg';headers['x-photo-stamp']=row.stamp!;headers['x-replace-photo']=row.existing?'yes':'no';}
 const response=await fetch('/api/batch-portraits',{method:'POST',headers,body:save?row.crop:undefined,cache:'no-store'});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Request failed.');
 return data;
}
export default function BatchPortraits(){
 const [rows,setRows]=useState<Row[]>([]),[busy,setBusy]=useState(false);
 const urls=useRef<string[]>([]),active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;urls.current.forEach(URL.revokeObjectURL);};},[]);
 function update(i:number,changes:Partial<Row>){setRows(previous=>previous.map((r,j)=>i===j?{...r,...changes}:r));}
 async function select(files:File[]){
  urls.current.forEach(URL.revokeObjectURL);urls.current=[];
  const counts=new Map<string,number>();
  const pending=files.map(file=>{const number=numberFromPhoto(file.name)||'';counts.set(number,(counts.get(number)||0)+1);return {file,number,selected:false,message:'Preparing…'};});
  setRows(pending);setBusy(true);
  for(const [i,row] of pending.entries()){
   if(!active.current)break;
   try{
    if(!row.number)throw Error('Use the exact Employee Number and a JPG or PNG extension.');
    if(counts.get(row.number)!==1)throw Error('Duplicate Employee Number in this selection.');
    const match=await request(row),crop=await cropPhoto(row.file);
    if(!active.current)break;
    const url=URL.createObjectURL(crop);urls.current.push(url);
    update(i,{...match,crop,url,selected:!match.existing,message:match.existing?'Existing photo. Select to replace.':'Ready to upload'});
   }catch(e){update(i,{message:e instanceof Error?e.message:'Could not prepare this photo.'});}
  }
  setBusy(false);
 }
 async function save(){
  setBusy(true);
  for(const [i,row] of rows.entries()){
   if(!active.current)break;
   if(!row.selected||!row.crop||row.saved)continue;
   try{await request(row,true);update(i,{selected:false,saved:true,message:'Saved · awaiting verification'});}
   catch(e){update(i,{message:e instanceof Error?e.message:'Upload failed. Retry this photo.'});}
  }
  setBusy(false);
 }
 const selected=rows.filter(r=>r.selected&&!r.saved).length;
 return <section className="panel import-workflow"><h2>Batch employee photos</h2><p>Name each JPG or PNG with its exact Employee Number, for example <b>001234.jpg</b>. Review the automatic 350 × 450 crop and employee name before uploading.</p>
 <label className="import-drop">Choose photos (up to 50 MB each)<input type="file" multiple accept=".jpg,.jpeg,.png" disabled={busy} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';void select(files);}}/></label>
 {!!rows.length&&<><div className="table-scroll"><table><thead><tr><th>Upload</th><th>Portrait</th><th>File</th><th>Employee Number</th><th>Employee</th><th>Status</th></tr></thead>
 <tbody>{rows.map((row,i)=><tr key={i}><td><input type="checkbox" aria-label={'Upload '+row.file.name} disabled={busy||!row.crop||row.saved} checked={row.selected} onChange={e=>update(i,{selected:e.target.checked})}/></td><td>{row.url&&<img src={row.url} width="56" height="72" alt={'Crop for '+row.number}/>}</td><td>{row.file.name}</td><td>{row.number}</td><td>{row.name}</td><td>{row.message}</td></tr>)}</tbody></table></div>
 <p role="status">{busy?'Processing photos…':rows.filter(r=>r.saved).length+' saved · '+selected+' selected'}</p>
 <button className="btn primary" disabled={busy||!selected} onClick={save}>Upload selected photos ({selected})</button></>}
 </section>;
}
