import {randomUUID} from 'node:crypto';
import {env} from '@/lib/aws-runtime';
import {uploadURL,downloadURL} from '@/lib/object-storage';
import {getChatGPTUser} from '../../chatgpt-auth';

const prefix='workbook-inbox:';
const limit=25*1024*1024;
const validId=(id:unknown):id is string=>typeof id==='string'&&/^\d{13}-[a-f0-9-]{36}$/.test(id);
const send=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function lookup(id:string){
 const row=await env.DB.prepare('SELECT revision,payload FROM registry WHERE id=?').bind(prefix+id).first<{revision:number;payload:string}>();
 return row&&{state:row.revision,...JSON.parse(row.payload)};
}
export async function POST(req:Request){
 const user=await getChatGPTUser();
 if(!user)return send({error:'Sign in to upload a workbook.'},401);
 if(req.headers.get('origin')!==new URL(process.env.APP_URL||req.url).origin)return send({error:'Use the registry to upload.'},403);
 const data=await req.json().catch(()=>null);
 try{
  if(data?.action==='start'){
   if(typeof data.name!=='string'||data.name.length>255||!/^([^/\\\x00-\x1f]+)\.xlsx?$/i.test(data.name)||
      !Number.isSafeInteger(data.bytes)||data.bytes<1||data.bytes>limit)return send({error:'Choose an XLS or XLSX workbook up to 25 MB.'},400);
   const id=Date.now()+'-'+randomUUID(),key='uploads/workbooks/'+id;
   const entry={id,key,name:data.name,bytes:data.bytes,owner:user.userId,created:new Date().toISOString()};
   const url=await uploadURL(key,data.bytes);
   await env.DB.prepare('INSERT INTO registry(id,revision,payload) VALUES (?,0,?)').bind(prefix+id,JSON.stringify(entry)).run();
   return send({id,url});
  }
  if(data?.action!=='finish'||!validId(data.id))return send({error:'Invalid upload request.'},400);
  const row=await lookup(data.id);
  if(!row||row.owner!==user.userId)return send({error:'Upload unavailable.'},404);
  if(row.state===0){
   const obj=await env.BUCKET.head(row.key);
   if(!obj||obj.ContentLength!==row.bytes||!obj.VersionId)return send({error:'Upload incomplete. Please try again.'},409);
   const {state,...entry}=row;
   await env.DB.prepare('UPDATE registry SET revision=1,payload=? WHERE id=? AND revision=0')
    .bind(JSON.stringify({...entry,version:obj.VersionId}),prefix+data.id).run();
  }
  return send({received:true});
 }catch{return send({error:'The workbook could not be submitted. Please retry.'},503);}
}
export async function GET(req:Request){
 const user=await getChatGPTUser();
 if(!user?.canManageSources)return send({error:'Source manager access required.'},user?403:401);
 const params=new URL(req.url).searchParams,id=params.get('id');
 if(id){
  if(!validId(id))return send({error:'Invalid upload reference.'},400);
  const row=await lookup(id);if(row?.state!==1)return send({error:'Workbook unavailable.'},404);
  return new Response(null,{status:302,headers:{Location:await downloadURL(row.key,row.name,row.version),'Cache-Control':'private, no-store'}});
 }
 const cursor=params.get('before');
 if(cursor&&!validId(cursor))return send({error:'Invalid cursor.'},400);
 const rows=await env.DB.prepare('SELECT payload FROM registry WHERE id LIKE ? AND revision=1 AND id<? ORDER BY id DESC LIMIT 51')
  .bind(prefix+'%',prefix+(cursor||'z')).all<{payload:string}>();
 const items=rows.results.slice(0,50).map(r=>{const {id,name,created}=JSON.parse(r.payload);return {id,name,created};});
 return send({items,next:rows.results.length>50?items[49].id:null});
}
