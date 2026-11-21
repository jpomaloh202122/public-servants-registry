'use client';
import {useState,useEffect,useRef} from 'react';
type Entry={id:string;name:string;created:string};
const api='/api/workbook-uploads';
async function request(action:string,data:Record<string,unknown>){
 const response=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data})});
 const result=await response.json();
 if(!response.ok)throw Error(result.error||'Upload failed.');
 return result;
}
export default function WorkbookUpload({manager}:{manager:boolean}){
 const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [entries,setEntries]=useState<Entry[]>([]),[next,setNext]=useState<string|null>(null);
 const picker=useRef<HTMLInputElement>(null),uploaded=useRef<string|null>(null);
 async function list(before?:string){
  const response=await fetch(api+(before?'?before='+encodeURIComponent(before):''),{cache:'no-store'});
  if(!response.ok)throw Error('Could not load received workbooks.');
  const page=await response.json();setEntries(previous=>before?[...previous,...page.items]:page.items);setNext(page.next);
 }
 useEffect(()=>{if(manager)list().catch(e=>setError(e.message));},[manager]);
 async function submit(){
  if(!file||busy)return;setBusy(true);setNotice('');setError('');
  try{
   if(!uploaded.current){
    const {id,url}=await request('start',{name:file.name,bytes:file.size});
    const sent=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:file});
    if(!sent.ok)throw Error('File transfer failed. Please retry.');
    uploaded.current=id;
   }
   await request('finish',{id:uploaded.current});uploaded.current=null;setFile(null);
   if(picker.current)picker.current.value='';
   setNotice('Workbook received for review.');
   if(manager)await list();
  }catch(e){setError(e instanceof Error?e.message:'Upload failed.');}finally{setBusy(false);}
 }
 return <section className="panel import-workflow"><h2>Upload Excel workbook</h2>
 <p>Submit a Whole-of-Government establishment workbook or employee source file for review.</p>
 <label className="import-drop">Choose workbook (.xls or .xlsx, up to 50 MB)<input ref={picker} type="file" accept=".xls,.xlsx" disabled={busy} onChange={e=>{
  const f=e.target.files?.[0];uploaded.current=null;setNotice('');setError('');setFile(null);
  if(!f)return;
  if(!/\.xlsx?$/i.test(f.name)||!f.size||f.size>50*1024*1024){setError('Choose an XLS or XLSX workbook up to 50 MB.');return;}setFile(f);
 }}/></label>
 <button className="btn primary" disabled={!file||busy} onClick={submit}>{busy?'Uploading…':'Upload workbook'}</button>
 {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
 {manager&&<><h3>Received workbooks</h3>{entries.length===0?<p>No submissions to display.</p>:<ul>{entries.map(e=><li key={e.id}><a href={api+'?id='+e.id}>{e.name}</a> · {new Date(e.created).toLocaleDateString('en-PG',{timeZone:'Pacific/Port_Moresby'})}</li>)}</ul>}
 {next&&<button className="btn" onClick={()=>list(next).catch(e=>setError(e.message))}>Load earlier submissions</button>}</>}
 </section>;
}
