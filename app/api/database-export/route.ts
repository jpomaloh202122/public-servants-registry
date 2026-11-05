import {env} from '@/lib/aws-runtime';
import {getChatGPTUser} from '../../chatgpt-auth';
import {config} from '../../server-registry';
import {assessmentCTE,qualityWhere,effectiveEmployee,pngToday} from '../../quality';
import {schema,sourceInsert,organisationInsert,employeeInsert,importGuide,type Engine} from '../../database-sql';
export async function GET(req:Request){
 if(!await getChatGPTUser())return new Response('Sign in required',{status:401,headers:{'Cache-Control':'no-store'}});
 const u=new URL(req.url),engine=u.searchParams.get('engine');
 if(u.searchParams.get('guide')==='1')return new Response(importGuide(),{headers:{'Content-Type':'text/plain;charset=utf-8','Content-Disposition':'attachment; filename="Registry_Database_Import_Guide.txt"','Cache-Control':'private,no-store'}});
 if(engine!=='mysql'&&engine!=='oracle')return new Response('Select MySQL or Oracle',{status:400});
 const d:Engine=engine,c=await config(),schemaOnly=u.searchParams.get('content')==='schema';
 if(!c.dataset)return new Response('Source records are not ready',{status:409});
 const filtered=u.searchParams.get('scope')==='filtered',asOf=pngToday();const {where,args}=qualityWhere(filtered?u:new URL(req.url.split('?')[0]));const cte=assessmentCTE(c.source,asOf);
 const scope=JSON.stringify(filtered?{scope:'filtered',agency:u.searchParams.get('agency')||'all',status:u.searchParams.get('status')||'all',query:u.searchParams.get('query')||'',readiness:u.searchParams.get('readiness')||'all'}:{scope:'all'});
 const count=await env.DB!.prepare(cte+`SELECT COUNT(*) AS n FROM assessed WHERE ${where}`).bind(c.dataset,...args).first<{n:number}>();
 const orgs=await env.DB!.prepare('SELECT payload FROM organisations WHERE dataset=? ORDER BY key').bind(c.dataset).all<{payload:string}>();
 const now=new Date().toISOString(),enc=new TextEncoder();let started=false,cursor='',written=0;
 const stream=new ReadableStream({async pull(ctrl){try{
 const current=await config();if(current.dataset!==c.dataset||current.revision!==c.revision)throw Error('Registry changed during export. Retry the download.');
 if(!started){started=true;let s=`-- GOVERNMENT OF PAPUA NEW GUINEA | PUBLIC SERVANT REGISTRY\n-- ${d==='mysql'?'MySQL 8.0+':'Oracle 12c+ / SQL*Plus / SQLcl'} | Schema version 1 | UTC ${now}\n-- Import into a NEW EMPTY destination. No DROP statements. Read the import guide.\n-- ${schemaOnly?'SCHEMA ONLY — NO RECORDS':`Expected employees: ${count!.n}. Organisations: ${orgs.results.length}.`}\n-- Sensitive personal information. Photos are storage references only.\n`;
 s+=d==='oracle'?'SET DEFINE OFF\nSET SQLBLANKLINES ON\nWHENEVER OSERROR EXIT FAILURE ROLLBACK\nWHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK\n':"SET NAMES utf8mb4;\nSET time_zone = '+00:00';\n";s+=schema(d);
 if(!schemaOnly){s+=d==='mysql'?'START TRANSACTION;\n':'';s+=sourceInsert(c,count!.n,scope,now,d);for(const r of orgs.results)s+=organisationInsert(JSON.parse(r.payload),c.dataset,d);}
 ctrl.enqueue(enc.encode(s));if(schemaOnly){ctrl.enqueue(enc.encode('-- EXPORT COMPLETE: SCHEMA ONLY\n'));ctrl.close();}return;}
 const rows=await env.DB!.prepare(cte+`SELECT number,payload FROM assessed WHERE ${where} AND number>? ORDER BY number LIMIT 500`).bind(c.dataset,...args,cursor).all<{number:string,payload:string}>();
 if(!rows.results.length){if(written!==count!.n)throw Error('Export count changed; retry.');const latest=await config();if(latest.revision!==c.revision||latest.dataset!==c.dataset)throw Error('Registry changed; retry.');ctrl.enqueue(enc.encode(`COMMIT;\nSELECT COUNT(*) AS actual_employees FROM sp_employee;\nSELECT exported_employees AS expected_employees FROM sp_source;\nSELECT employee_number,COUNT(*) FROM sp_employee GROUP BY employee_number HAVING COUNT(*)>1;\nSELECT COUNT(*) AS orphan_organisations FROM sp_employee e LEFT JOIN sp_organisation o ON o.organisation_id=e.organisation_id WHERE o.organisation_id IS NULL;\n-- EXPORT COMPLETE: ${written} employees\n`));ctrl.close();return;}
 let out='';for(const r of rows.results)out+=employeeInsert(effectiveEmployee(JSON.parse(r.payload),c.source),c.dataset,d);written+=rows.results.length;cursor=rows.results.at(-1)!.number;ctrl.enqueue(enc.encode(out));
 }catch(e){ctrl.error(e);}}});
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Pacific/Port_Moresby',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replace(/[^0-9-]/g,'');
 return new Response(stream,{headers:{'Content-Type':'application/sql;charset=utf-8','Content-Disposition':`attachment; filename="Registry_${d==='mysql'?'MySQL':'Oracle'}_${filtered?'Filtered':'All'}_${schemaOnly?'Schema':'Data'}_${day}.sql"`,'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'}});
}
