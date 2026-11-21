import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {env} from '@/lib/aws-runtime';
import {getChatGPTUser} from '../../chatgpt-auth';
import {config,CONFIG} from '../../server-registry';
import {numberFromPhoto,portraitWidth,portraitHeight} from '../../batch-portrait-model';
import type {Employee} from '../../model';

const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(req:Request){
 const user=await getChatGPTUser();if(!user)return reply({error:'Sign in to upload employee photos.'},401);
 if(req.headers.get('origin')!==new URL(process.env.APP_URL||req.url).origin)return reply({error:'Use the registry to submit photos.'},403);
 let filename:string;try{filename=decodeURIComponent(req.headers.get('x-photo-filename')||'');}catch{return reply({error:'Invalid filename.'},400);}
 const number=numberFromPhoto(filename);if(!number)return reply({error:'Name the JPG or PNG with the exact Employee Number.'},400);
 const action=req.headers.get('x-photo-action');
 if(action!=='preview'&&action!=='save')return reply({error:'Invalid photo action.'},400);
 try{
  const c=await config();
  const row=await env.DB.prepare('SELECT id,payload FROM employees WHERE dataset=? AND number=?')
   .bind(c.dataset,number).first<{id:string;payload:string}>();
  if(!row)return reply({error:'No matching Employee Number in the current registry.'},404);
  const employee:Employee=JSON.parse(row.payload);
  if(employee.number!==number)return reply({error:'Employee Number does not match exactly.'},409);
  const name=[employee.first,employee.last].filter(Boolean).join(' ');
  const stamp=createHash('sha256').update(JSON.stringify([c.dataset,row.id,number,name,employee.photo,employee.verified])).digest('hex');
  if(action==='preview')return reply({name,number,stamp,existing:!!employee.photo});
  if(req.headers.get('content-type')!=='image/jpeg'||!req.body)return reply({error:'A cropped JPEG is required.'},400);
  const reader=req.body.getReader(),chunks:Uint8Array[]=[];let length=0;
  try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;
   if(length>1024*1024){await reader.cancel();return reply({error:'Cropped portrait exceeds 1 MB.'},413);}chunks.push(part.value);}
  }finally{reader.releaseLock();}
  let portrait:Buffer;
  try{
   const image=sharp(Buffer.concat(chunks),{limitInputPixels:portraitWidth*portraitHeight,failOn:'error'}),meta=await image.metadata();
   if(meta.format!=='jpeg'||meta.width!==portraitWidth||meta.height!==portraitHeight)throw Error();
   portrait=await image.jpeg({quality:92}).toBuffer();
  }catch{return reply({error:'Invalid 350 × 450 JPEG crop.'},400);}
  const digest=createHash('sha256').update(portrait).digest('hex').slice(0,32);
  const folder=[digest.slice(0,8),digest.slice(8,12),digest.slice(12,16),digest.slice(16,20),digest.slice(20)].join('-');
  const encoded=encodeURIComponent(number).replace(/[!'()*.]/g,ch=>'%'+ch.charCodeAt(0).toString(16).toUpperCase());
  const key='portraits/'+folder+'/'+encoded+'.jpg';
  if(employee.photo===key)return reply({saved:true});
  if(stamp!==req.headers.get('x-photo-stamp')||(employee.photo&&req.headers.get('x-replace-photo')!=='yes'))
   return reply({error:'Employee or portrait changed. Review the current assignment before replacing it.'},409);
  await env.BUCKET.put(key,portrait,{httpMetadata:{contentType:'image/jpeg'}});
  const time=new Date().toISOString(),event={id:randomUUID(),time,action:'Employee portrait assigned',detail:number+' · pending verification',actor:user.displayName};
  const updated={...employee,photo:key,verified:false,updated:time};
  const statements=[env.DB.prepare('UPDATE employees SET payload=?,ready=0 WHERE id=? AND dataset=? AND payload=?')
   .bind(JSON.stringify(updated),row.id,c.dataset,row.payload).expectChanges(1)];
  if(env.DB.dialect==='postgres')statements.push(env.DB.prepare('INSERT INTO audit_events(id,created_at,actor,payload) VALUES (?,?,?,?)')
   .bind(event.id,time,user.userId,JSON.stringify({...event,dataset:c.dataset})));
  const {revision,...state}=c;
  statements.push(env.DB.prepare('UPDATE registry SET payload=?,revision=revision+1 WHERE id=? AND revision=?')
   .bind(JSON.stringify({...state,events:[event,...(state.events||[])].slice(0,100)}),CONFIG,revision).expectChanges(1));
  await env.DB.batch(statements);
  return reply({saved:true});
 }catch(error){
  if(error instanceof Error&&/concurrent/i.test(error.message))return reply({error:'Registry changed. Retry the photo or select it again to refresh the preview.'},409);
  return reply({error:'Could not complete the photo request. Please retry.'},503);
 }
}
