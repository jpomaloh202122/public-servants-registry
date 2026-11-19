import {env} from '@/lib/aws-runtime';
import {getChatGPTUser} from '../../chatgpt-auth';
import {config} from '../../server-registry';
import {effectiveEmployee,pngToday} from '../../quality';
import {ready,issues,type Employee,type Agency} from '../../model';
import type {IdCard} from '../../id-card';

const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(request:Request) {
 if(!await getChatGPTUser())return Response.json({error:'Sign in to prepare a card.'},{status:401,headers});
 const number=new URL(request.url).searchParams.get('employeeNumber');
 if(!number||number!==number.trim()||number.length>100||/[\u0000-\u001f\u007f]/.test(number))
  return Response.json({error:'Provide an exact Employee Number.'},{status:400,headers});
 try {
  const current=await config();
  if(!current.dataset)return Response.json({error:'No active payroll dataset.'},{status:409,headers});
  const row=await env.DB.prepare('SELECT payload FROM employees WHERE dataset=? AND number=?')
   .bind(current.dataset,number).first<{payload:string}>();
  if(!row)return Response.json({error:'Employee not found in the current registry.'},{status:404,headers});
  const employee=effectiveEmployee(JSON.parse(row.payload) as Employee,current.source);
  if(employee.number!==number)return Response.json({error:'Review the inconsistent Employee Number before preparing a card.'},{status:409,headers});
  if(employee.payrollAbsent||!ready(employee))
   return Response.json({error:'This employee does not meet the SevisPass review requirements.',
    checks:issues(employee),status:employee.status},{status:409,headers});
  const organisation=await env.DB.prepare('SELECT payload FROM organisations WHERE dataset=? AND key=?')
   .bind(current.dataset,employee.agency).first<{payload:string}>();
  const agency=organisation?JSON.parse(organisation.payload) as Agency:null;
  if(!agency?.name?.trim()||!agency.code?.trim()||!employee.photo.startsWith('portraits/'))
   return Response.json({error:'Review the organisation and verified photograph before preparing a card.'},{status:409,headers});
  const latest=await config();
  if(latest.dataset!==current.dataset||latest.revision!==current.revision)
   return Response.json({error:'The registry changed. Reload the card preview.'},{status:409,headers});
  const card:IdCard={
   employeeNumber:employee.number,name:[employee.first,employee.last].join(' ').trim(),
   agency:agency.name,agencyCode:agency.code,position:employee.position,
   photoUrl:'/api/photo?key='+encodeURIComponent(employee.photo),
   datasetId:current.dataset,revision:Number(current.revision),payrollCycle:current.source?.asOf??null,
   assessedOn:pngToday(),preparedAt:new Date().toISOString(),status:'preview'
  };
  return Response.json(card,{headers});
 } catch {
  return Response.json({error:'The card could not be prepared. Retry after checking the registry connection.'},{status:503,headers});
 }
}
