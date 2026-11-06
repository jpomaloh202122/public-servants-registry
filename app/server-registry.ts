import {env} from '@/lib/aws-runtime';
import {ready,type Employee} from './model';
import {assessmentCTE,employeeSearchPattern,qualityWhere,aggregateColumns,flagKeys,effectiveEmployee,pngToday} from './quality';
export const CONFIG='excel-config';
export async function config(){const r=await env.DB!.prepare('SELECT revision,payload FROM registry WHERE id=?').bind(CONFIG).first<{revision:number,payload:string}>();return r?{revision:r.revision,...JSON.parse(r.payload)}:{revision:0,dataset:'',source:null,events:[]};}
export function employeeStatement(dataset:string,e:Employee){return env.DB!.prepare('INSERT INTO employees (id,dataset,number,agency,status,search,ready,payload) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(dataset,number) DO NOTHING').bind(dataset+':'+e.id,dataset,e.number,e.agency,e.status,`${e.first} ${e.last} ${e.number} ${e.position}`.toLowerCase(),ready(e)?1:0,JSON.stringify(e));}
type QualityFlag=(typeof flagKeys)[number];
type QualityGroup={agency:string;status:string;count:number}&Record<QualityFlag,number>;
type Selection={agency:string;total:number;active:number;ready:number};
let inFlight: {key:string; result:Promise<QualityGroup[]>}|undefined;

export async function qualityGroups(c:Awaited<ReturnType<typeof config>>,asOf=pngToday()):Promise<QualityGroup[]>{
 if(!c.dataset)return [];
 const key='sources/quality-cache/v1/'+encodeURIComponent(c.dataset)+'/'+c.revision+'/'+asOf+'.json';
 if(inFlight?.key===key)return inFlight.result;
 const result=readQualityGroups(c,asOf,key);
 inFlight={key,result};
 try{return await result;}
 finally{if(inFlight?.result===result)inFlight=undefined;}
}

async function readQualityGroups(c:Awaited<ReturnType<typeof config>>,asOf:string,key:string):Promise<QualityGroup[]>{
 if(env.DB.dialect==='postgres'){
  try{
   const cached=await env.BUCKET.get(key);
   if(cached?.body){
    const groups:unknown=await new Response(cached.body).json();
    if(Array.isArray(groups))return groups as QualityGroup[];
   }
  }catch{
   // A missing or unavailable cache must not prevent a database read.
  }
 }else{
  const cached=await env.DB.prepare('SELECT payload FROM registry WHERE id=?').bind('quality-summary:'+c.dataset).first<{payload:string}>();
  if(cached){
   const saved=JSON.parse(cached.payload);
   if(saved.revision===c.revision&&saved.asOf===asOf&&saved.version===3)return saved.groups;
  }
 }
 const {results:groups}=await env.DB.prepare(assessmentCTE(c.source,asOf,env.DB.dialect)+`SELECT agency,status,${aggregateColumns} FROM assessed GROUP BY agency,status`).bind(c.dataset).all<QualityGroup>();
 if(env.DB.dialect==='postgres'){
  try{await env.BUCKET.put(key,new TextEncoder().encode(JSON.stringify(groups)),{httpMetadata:{contentType:'application/json'}});}
  catch{console.warn('Registry quality summary cache write failed.');}
 }else{
  await env.DB.prepare('INSERT INTO registry(id,revision,payload) VALUES (?,0,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload')
   .bind('quality-summary:'+c.dataset,JSON.stringify({version:3,revision:c.revision,asOf,groups})).run();
 }
 return groups;
}

export async function listing(req:Request){const c=await config(),u=new URL(req.url),asOf=pngToday();const search=employeeSearchPattern(u);const filters=new URL(u);filters.searchParams.delete('query');const {where,args}=qualityWhere(filters),cte=assessmentCTE(c.source,asOf,env.DB.dialect,!!search);const bindings=[c.dataset,...(search?[search]:[]),...args];const page=Math.max(0,parseInt(u.searchParams.get('page')||'0')||0),limit=Math.min(100,Math.max(1,parseInt(u.searchParams.get('limit')||'10')||10));
  const statusExpr=c.source
   ? env.DB.dialect==='postgres'?"CASE WHEN status='Not provided' AND NOT COALESCE((payload::jsonb->>'statusReviewed')::boolean,false) THEN 'Active' ELSE status END":"CASE WHEN status='Not provided' AND COALESCE(json_extract(payload,'$.statusReviewed'),0)=0 THEN 'Active' ELSE status END"
   : 'status';
 if(u.searchParams.get('qualityOnly')==='1'){
  const groups=await qualityGroups(c,asOf);
  const flags=Object.fromEntries(flagKeys.map(k=>[k,groups.reduce((n,g)=>n+Number(g[k]||0),0)]));
  return {revision:c.revision,asOf,groups,flags,ready:flags.ready};
 }
 if(u.searchParams.get('readinessTotal')==='1'){
  const assessment=assessmentCTE(c.source,asOf,env.DB.dialect,false,true);
  const result=await env.DB.prepare(assessment+'SELECT COUNT(*) AS total FROM assessed WHERE ready=1')
   .bind(c.dataset).first<{total:number}>();
  return {revision:c.revision,ready:Number(result?.total??0)};
 }
 if(u.searchParams.get('basic')==='1'){
  const [rows,orgs,counts]=await Promise.all([
   env.DB.prepare('SELECT payload FROM employees WHERE dataset=? ORDER BY number LIMIT ?').bind(c.dataset,limit).all<{payload:string}>(),
   env.DB.prepare('SELECT payload FROM organisations WHERE dataset=? ORDER BY key').bind(c.dataset).all<{payload:string}>(),
   env.DB.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN ${statusExpr}='Active' THEN 1 ELSE 0 END) AS active FROM employees WHERE dataset=?`).bind(c.dataset).first<{total:number;active:number}>()
  ]);
  const total=Number(counts?.total??0),active=Number(counts?.active??0);
  return {revision:c.revision,data:{employees:rows.results.map(r=>effectiveEmployee(JSON.parse(r.payload),c.source)),agencies:orgs.results.map(r=>JSON.parse(r.payload)),events:c.events||[],sample:false},summary:{total,active,ready:0,matched:total,matchedActive:active,matchedReady:0,flags:{},groups:[],selected:[],source:c.source,asOf,qualityPending:true}};
 }
 if(search){
  const [rows,orgs,counts,selected]=await Promise.all([
   env.DB.prepare(cte+`SELECT payload FROM assessed WHERE ${where} ORDER BY number LIMIT ? OFFSET ?`).bind(...bindings,limit,page*limit).all<{payload:string}>(),
   env.DB.prepare('SELECT payload FROM organisations WHERE dataset=? ORDER BY key').bind(c.dataset).all<{payload:string}>(),
   env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN ${statusExpr}='Active' THEN 1 ELSE 0 END) AS active FROM employees WHERE dataset=?`).bind(c.dataset).first<{total:number;active:number}>(),
   env.DB.prepare(cte+`SELECT agency,COUNT(*) AS total,SUM(CASE WHEN status='Active' THEN 1 ELSE 0 END) AS active,SUM(ready) AS ready FROM assessed WHERE ${where} GROUP BY agency`).bind(...bindings).all<Selection>()
  ]);
  const matches=selected.results.map(r=>({...r,total:Number(r.total),active:Number(r.active),ready:Number(r.ready)}));
  const matched=matches.reduce((n,r)=>n+r.total,0),matchedActive=matches.reduce((n,r)=>n+r.active,0),matchedReady=matches.reduce((n,r)=>n+r.ready,0);
  return {revision:c.revision,data:{employees:rows.results.map(r=>effectiveEmployee(JSON.parse(r.payload),c.source)),agencies:orgs.results.map(r=>JSON.parse(r.payload)),events:c.events||[],sample:false},summary:{total:Number(counts?.total??0),active:Number(counts?.active??0),ready:matchedReady,flags:{},groups:[],selected:matches,matched,matchedActive,matchedReady,source:c.source,asOf,qualityPending:true}};
 }
 const [rows,orgs,groups]=await Promise.all([env.DB!.prepare(cte+`SELECT payload FROM assessed WHERE ${where} ORDER BY number LIMIT ? OFFSET ?`).bind(...bindings,limit,page*limit).all<{payload:string}>(),env.DB!.prepare('SELECT payload FROM organisations WHERE dataset=? ORDER BY key').bind(c.dataset).all<{payload:string}>(),qualityGroups(c,asOf)]);
 const allFlags=Object.fromEntries(flagKeys.map(k=>[k,groups.reduce((n,g)=>n+(g[k]||0),0)]));let selected:Selection[]=[];
 {const a=u.searchParams.get('agency'),s=u.searchParams.get('status'),r=u.searchParams.get('readiness')||'all';const map=new Map<string,Selection>();for(const g of groups){if(a&&a!=='all'&&a!==g.agency||s&&s!=='all'&&s!==g.status)continue;const n=r==='all'||!flagKeys.includes(r as QualityFlag)?g.count:g[r as QualityFlag]||0;const prev=map.get(g.agency)||{agency:g.agency,total:0,active:0,ready:0};prev.total+=n;prev.active+=g.status==='Active'?n:0;prev.ready+=r==='all'||r==='photo_verified'?g.ready||0:r==='ready'?n:0;map.set(g.agency,prev);}selected=[...map.values()];}
 const summary={total:groups.reduce((n,g)=>n+g.count,0),active:groups.filter(x=>x.status==='Active').reduce((n,x)=>n+x.count,0),ready:allFlags.ready,flags:allFlags,asOf,groups,selected,matched:selected.reduce((n,x)=>n+x.total,0),matchedActive:selected.reduce((n,x)=>n+x.active,0),matchedReady:selected.reduce((n,x)=>n+x.ready,0),source:c.source};return {revision:c.revision,data:{employees:rows.results.map(r=>effectiveEmployee(JSON.parse(r.payload),c.source)),agencies:orgs.results.map(r=>JSON.parse(r.payload)),events:c.events||[],sample:false},summary};}
