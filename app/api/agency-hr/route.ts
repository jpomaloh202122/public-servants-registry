import {getRegistrySession} from '../../chatgpt-auth';
import {env} from '@/lib/aws-runtime';
import {config,CONFIG} from '../../server-registry';
import {ready,type Employee} from '../../model';
import {audit} from '../../registry-access';
import {storePortrait} from '../../store-portrait';

const fields=['first','last','gender','dob','position'] as const;
const response=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
async function scope(){
 const user=await getRegistrySession();
 if(user?.access!=='hr'||!user.agency)return null;
 const current=await config();
 const {results}=await env.DB.prepare("SELECT key,payload FROM organisations WHERE dataset=? AND json_extract(payload,'$.code')=? LIMIT 2").bind(current.dataset,user.agency).all<{key:string;payload:string}>();
 if(results.length!==1)return null;
 return {user,current,key:results[0].key,name:JSON.parse(results[0].payload).name};
}
export async function GET(req:Request){
 const s=await scope();if(!s)return response({error:'Agency access unavailable.'},403);
 const params=new URL(req.url).searchParams;
 if(params.has('portrait')){
  const row=await env.DB.prepare('SELECT payload FROM employees WHERE dataset=? AND agency=? AND number=?').bind(s.current.dataset,s.key,params.get('portrait')).first<{payload:string}>();
  const key=row&&JSON.parse(row.payload).photo;
  const obj=key?.startsWith('portraits/')?await env.BUCKET.get(key):null;
  return obj?new Response(obj.body,{headers:{'Content-Type':obj.httpMetadata?.contentType||'image/jpeg','Cache-Control':'private, no-store'}}):response({error:'Portrait unavailable.'},404);
 }
 const page=Math.min(100000,Math.max(0,parseInt(params.get('page')||'0')||0));
 const pattern='%'+(params.get('q')||'').trim().toLowerCase().slice(0,120).replace(/[!%_]/g,'!$&')+'%';
 const {results}=await env.DB.prepare("SELECT payload FROM employees WHERE dataset=? AND agency=? AND search LIKE ? ESCAPE '!' ORDER BY number LIMIT 26 OFFSET ?").bind(s.current.dataset,s.key,pattern,page*25).all<{payload:string}>();
 return response({agency:s.name,dataset:s.current.dataset,revision:s.current.revision,more:results.length>25,employees:results.slice(0,25).map(row=>{
  const e:Employee=JSON.parse(row.payload);
  return {number:e.number,...Object.fromEntries(fields.map(f=>[f,e[f]||''])),hasPhoto:!!e.photo};
 })});
}
export async function POST(req:Request){
 const s=await scope();if(s?.user.role?.mode!=='correct')return response({error:'Correction access required.'},403);
 if(req.headers.get('origin')!==(process.env.APP_URL||new URL(req.url).origin))return response({error:'Invalid origin.'},403);
 const data=await req.formData();const number=data.get('employeeNumber');
 if(typeof number!=='string'||data.get('revision')!==String(s.current.revision)||data.get('dataset')!==s.current.dataset)return response({error:'Refresh the employee list and review the latest record.'},409);
 const row=await env.DB.prepare('SELECT payload FROM employees WHERE dataset=? AND agency=? AND number=?').bind(s.current.dataset,s.key,number).first<{payload:string}>();
 if(!row)return response({error:'Employee unavailable.'},404);
 const e:Employee=JSON.parse(row.payload),changes:string[]=[];
 for(const f of fields){
  if(!data.has(f))continue;
  const v=data.get(f);
  if(typeof v!=='string'||v.length>200)return response({error:'Invalid '+f},400);
  const value=v.trim();if(value===(e[f]||''))continue;
  if(!value)return response({error:'Enter a correction before saving '+f+'.'},400);
  if(f==='dob'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value||value>new Date().toISOString().slice(0,10)))return response({error:'Enter a valid date of birth.'},400);
  e[f]=value;changes.push(f);
 }
 const file=data.get('file');
 if(file instanceof File&&file.size){
  const uploaded=await storePortrait(data);if(!uploaded.ok)return uploaded;
  e.photo=(await uploaded.json()).key;changes.push('photograph');
 }
 if(!changes.length)return response({ok:true});
 e.verified=false;e.updated=new Date().toISOString();
 try{await env.DB.batch([
  env.DB.prepare('UPDATE registry SET revision=revision+1 WHERE id=? AND revision=?').bind(CONFIG,s.current.revision).expectChanges(1),
  env.DB.prepare('UPDATE employees SET payload=?,ready=?,search=? WHERE dataset=? AND agency=? AND number=?').bind(JSON.stringify(e),ready(e)?1:0,[e.first,e.last,e.number,e.position].join(' ').toLowerCase(),s.current.dataset,s.key,number).expectChanges(1),
  audit(s.user.userId,'Agency HR correction',s.user.agency+' / '+number+' / '+changes.join(', '))
 ]);}catch{return response({error:'The record changed. Refresh before retrying.'},409);}
 return response({ok:true});
}
