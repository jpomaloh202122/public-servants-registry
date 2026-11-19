import {env} from '@/lib/aws-runtime';
import {cardSetupAvailable} from './server-id-card';
export async function issuedCards(url:URL) {
 const installed=await cardSetupAvailable();
 const page=Math.max(0,Math.min(1000000,parseInt(url.searchParams.get('page')||'0')||0));
 const limit=20;
 if(!installed)return {installed:false,issued:0,matched:0,page,limit,cards:[]};
 const summary=await env.DB.prepare("SELECT COUNT(*) AS count FROM registry_id_cards WHERE state='issued'").first<{count:number}>();
 const issued=Number(summary?.count??0);
 if(url.searchParams.get('summary')==='1')return {installed:true,issued};
 const query=(url.searchParams.get('query')||'').trim().toLowerCase().slice(0,120);
 const pattern='%'+query.replace(/[!%_]/g,'!$&')+'%';
 const where="state='issued'"+(query?" AND (lower(employee_number) LIKE ? ESCAPE '!' OR lower(payload::jsonb->>'name') LIKE ? ESCAPE '!')":'');
 const bindings=query?[pattern,pattern]:[];
 const [count,rows]=await Promise.all([
  query?env.DB.prepare('SELECT COUNT(*) AS count FROM registry_id_cards WHERE '+where).bind(...bindings).first<{count:number}>():Promise.resolve({count:issued}),
  env.DB.prepare('SELECT id,employee_number,issued_at::text AS issued_at,payload FROM registry_id_cards WHERE '+where+' ORDER BY issued_at DESC,id LIMIT ? OFFSET ?').bind(...bindings,limit,page*limit).all<{id:string;employee_number:string;issued_at:string;payload:string}>()
 ]);
 return {installed:true,issued,matched:Number(count?.count??0),page,limit,cards:rows.results.map(row=>{
  const card=JSON.parse(row.payload);
  // Explicit projection: never expose verification tokens, hashes, DOB or private review evidence in the list.
  return {id:row.id,employeeNumber:row.employee_number,issuedAt:row.issued_at,name:card.name,agency:card.agency,position:card.position,gender:card.gender};
 })};
}
