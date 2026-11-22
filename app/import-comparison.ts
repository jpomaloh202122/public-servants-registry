import {env} from '@/lib/aws-runtime';

const fields={first:'First name',last:'Surname',dob:'Date of birth',gender:'Sex / gender',position:'Position',code:'Organisation code',department:'Organisation name',status:'Employment status',sourceUnit:'Unit',sourceConflict:'Conflicting source rows'} as const;
const keys=Object.keys(fields) as (keyof typeof fields)[];
export type ImportDifference={number:string;kind:string;fields:{label:string;current:string;incoming:string}[]};
export type ImportComparison={id:string;token:string;revision:number;totals:Record<string,number>;changes:ImportDifference[];next:string|null};

export async function compareImport(current:string,incoming:string,after:string,summary:boolean){
 const pg=env.DB.dialect==='postgres';
 const json=(table:string,key:string)=>pg?`(${table}.payload::jsonb->>'${key}')`:`json_extract(${table}.payload,'$.${key}')`;
 function snapshot(){
  const cols=keys.map(k=>{
   let value=k==='code'?json('o','code'):k==='department'?json('o','name'):json('e',k);
   if(k==='sourceConflict')value=`CASE WHEN CAST(${value} AS TEXT) IN ('1','true') THEN 'Yes' ELSE 'No' END`;
   return `COALESCE(${value},'') AS "${k}"`;
  });
  return `SELECT e.number,${cols.join(',')},CASE WHEN CAST(${json('e','payrollAbsent')} AS TEXT) IN ('1','true') THEN 1 ELSE 0 END AS absent
   FROM employees e LEFT JOIN organisations o ON o.dataset=e.dataset AND o.key=e.agency WHERE e.dataset=? AND e.number>?`;
 }
 const changed=keys.map(k=>`p."${k}"<>f."${k}"`).join(' OR ');
 const cte=`WITH p AS (${snapshot()}),f AS (${snapshot()}),delta AS (
  SELECT COALESCE(f.number,p.number) AS number,
  CASE WHEN f.number IS NULL THEN CASE WHEN p.absent=1 THEN 'unchanged' ELSE 'missing' END
       WHEN p.number IS NULL THEN 'added' WHEN p.absent=1 THEN 'returned'
       WHEN ${changed} OR f."sourceConflict"='Yes' THEN 'changed' ELSE 'unchanged' END AS kind,
  ${keys.map(k=>`p."${k}" AS "old_${k}",f."${k}" AS "new_${k}"`).join(',')}
  FROM p FULL OUTER JOIN f ON p.number=f.number)`;
 const args=[current,after,incoming,after];
 const totals:Record<string,number>={added:0,missing:0,returned:0,changed:0,unchanged:0};
 let fingerprint='';
 if(summary){
  const digest=pg?",md5(string_agg(md5(row_to_json(delta)::text),'' ORDER BY number)) AS digest":"";
  const counts=await env.DB.prepare(cte+' SELECT kind,COUNT(*) AS n'+digest+' FROM delta GROUP BY kind ORDER BY kind').bind(...args).all<{kind:string;n:number;digest?:string}>();
  if(pg)fingerprint=counts.results.map(r=>r.kind+'='+r.digest).join('|');
  for(const row of counts.results)totals[row.kind]=Number(row.n);
 }
 const {results}=await env.DB.prepare(cte+" SELECT * FROM delta WHERE kind<>'unchanged' ORDER BY number LIMIT 16").bind(...args).all<Record<string,string>>();
 const changes=results.slice(0,15).map(row=>({number:row.number,kind:row.kind,fields:keys.filter(k=>row['old_'+k]!==row['new_'+k]||k==='sourceConflict'&&row['new_'+k]==='Yes')
  .map(k=>({label:fields[k],current:row['old_'+k]||'',incoming:row['new_'+k]||''}))}));
 return {totals,changes,fingerprint,next:results.length>15?changes[14].number:null};
}
