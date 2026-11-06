import ts from 'typescript';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,mkdirSync} from 'node:fs';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
mkdirSync('work',{recursive:true});const dir=mkdtempSync(join(process.cwd(),'work','postgres-'));
try{
 for(const name of ['quality-postgres','quality','model','server-registry','server-management','management-report'])writeFileSync(join(dir,name+'.mjs'),ts.transpileModule(readFileSync('app/'+name+'.ts','utf8').replace(/from '\.\/([^']+)'/g,"from './$1.mjs'").replaceAll("'@/lib/aws-runtime'","'./runtime.mjs'"),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText);
 writeFileSync(join(dir,'postgres-sql.mjs'),ts.transpileModule(readFileSync('lib/postgres-sql.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText);
 const {postgresAssessmentCTE}=await import(pathToFileURL(join(dir,'quality-postgres.mjs')));const {postgresSQL}=await import(pathToFileURL(join(dir,'postgres-sql.mjs')));
 const db=new PGlite();await db.exec(readFileSync('infra/postgres/001-schema.sql','utf8'));await db.exec(readFileSync('infra/postgres/002-valid-dob.sql','utf8'));
 const sql=postgresSQL("SELECT '?' AS literal,? AS value,json_extract(payload,'$.sourceConflict')=1 AS flag FROM employees WHERE dataset=?");assert.equal(sql.count,2);assert.ok(sql.sql.includes("'?'"));
 const examples=[['2008-11-04',{}],['2008-11-05',{}],['1960-11-05',{}],['1960-11-04',{}],['2026-02-30',{}],['2027-01-01',{}],['',{}],['1990-01-01',{photo:'portraits/test',verified:true}],['1990-01-01',{sourceConflict:true}],['1990-01-01',{gender:'U'}]];
 for(const [i,[dob,extra]]of examples.entries()){const e={id:String(i),first:'Example',last:'Officer',gender:'F',dob,position:'Officer',photo:'',verified:false,...extra};await db.query('INSERT INTO employees VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[e.id,'test',String(i),'agency','Not provided','example officer',0,JSON.stringify(e)]);}
 const cte=postgresSQL(postgresAssessmentCTE({defaultEmploymentStatus:'Active'},'2026-11-04')).sql.replaceAll(':p0','$1');
 const {rows}=await db.query(cte+'SELECT * FROM assessed ORDER BY number',['test']);
 assert.equal(rows[0].age,18);assert.equal(rows[1].under18,1);assert.equal(rows[2].age,65);assert.equal(rows[3].over65,1);assert.equal(rows[4].invalid_dob,1);assert.equal(rows[5].future_dob,1);assert.equal(rows[6].missing_dob,1);assert.equal(rows[7].ready,1);assert.equal(rows[8].conflicts,1);assert.equal(rows[9].missing_fields,1);assert.equal(rows[0].status,'Active');
 const parsed=postgresSQL("SELECT SUM(CASE WHEN json_extract(payload,'$.sourceConflict')=1 THEN 1 ELSE 0 END) AS conflicts,COUNT(*) AS missingStatus FROM employees");
 assert.match(parsed.sql,/AS "missingStatus"/);const result=await db.query(parsed.sql);assert.equal(Number(result.rows[0].conflicts),1);

 const run=async(sql,args=[])=>{let i=0;const parsed=postgresSQL(sql).sql.replace(/:p[0-9]+/g,()=>'$'+(++i));return db.query(parsed,args);};
 const adapter={dialect:'postgres',prepare(sql){return {bind(...args){return {async first(){return (await run(sql,args)).rows[0]||null;},async all(){return {results:(await run(sql,args)).rows};},async run(){return {meta:{changes:(await run(sql,args)).affectedRows||0}};}};},async all(){return {results:(await run(sql)).rows};}};}};
 globalThis.__pgFixture={DB:adapter};writeFileSync(join(dir,'runtime.mjs'),'export const env=globalThis.__pgFixture;');
 await db.query('UPDATE registry SET payload=$1 WHERE id=$2',[JSON.stringify({dataset:'test',source:{source:'synthetic.csv',statusProvided:false},events:[]}), 'excel-config']);
 await db.query('INSERT INTO organisations VALUES ($1,$2,$3,$4)',['a','test','agency',JSON.stringify({id:'agency',code:'001',name:'Synthetic Agency',type:'Organisation'})]);
 const {listing}=await import(pathToFileURL(join(dir,'server-registry.mjs')));const list=await listing(new Request('https://test/api/registry?query=example&agency=agency'));assert.equal(Number(list.summary.total),10);assert.equal(Number(list.summary.matched),10);assert.equal(Number(list.summary.active),10);assert.equal(Number(list.summary.ready),1);assert.equal(Number(list.summary.matchedReady),1);assert.equal(list.summary.qualityPending,true);
 const {managementData}=await import(pathToFileURL(join(dir,'server-management.mjs')));const management=await managementData(new Request('https://test/api/management-reports'),{displayName:'Test'});assert.equal(management.report.total,10);
 await db.exec(`INSERT INTO employees (id,dataset,number,agency,status,search,ready,payload)
 SELECT 'large-'||n,'test','large-'||n,'agency','Active','example',0,
 (SELECT payload FROM employees WHERE dataset='test' AND number='0' LIMIT 1)
 FROM generate_series(1,150001) AS n`);
 const overview=await listing(new Request('https://test/api/registry?basic=1&limit=6'));
 assert.equal(overview.summary.total,150011);
 assert.equal(overview.summary.active,150011);
 assert.equal(overview.data.employees.length,6);
 assert.equal(overview.summary.qualityPending,true);
 const readinessTotal=await listing(new Request("https://test/api/registry?readinessTotal=1"));
 assert.equal(readinessTotal.ready,1);
 assert.equal(readinessTotal.revision,overview.revision);
 await db.query('UPDATE employees SET search=$1 WHERE dataset=$2 AND number=$3',["jane o'neill_100%!",'test','0']);
 const searchUrl=new URL('https://test/api/registry');
 searchUrl.searchParams.set('query',"  O’Neill_100%!  ".replace('’',"'"));
 const nameSearch=await listing(new Request(searchUrl));
 assert.equal(Number(nameSearch.summary.total),150011);
 assert.equal(Number(nameSearch.summary.matched),1);
 assert.equal(nameSearch.data.employees.length,1);
 searchUrl.searchParams.set('query','%_');
 const literalSearch=await listing(new Request(searchUrl));
 assert.equal(Number(literalSearch.summary.matched),0);

 const route=readFileSync('app/api/payroll-changes/route.ts','utf8')
 .replace("'../../chatgpt-auth'","'./auth.mjs'")
 .replace("'../../server-registry'","'./server-registry.mjs'")
 .replace("'@/lib/aws-runtime'","'./runtime.mjs'");
 writeFileSync(join(dir,'changes.mjs'),ts.transpileModule(route,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText);
 writeFileSync(join(dir,'auth.mjs'),"export const getChatGPTUser=async()=>({userId:'test'});");
 await db.query('UPDATE registry SET payload=$1 WHERE id=$2',[JSON.stringify({dataset:'next',source:{previousDataset:'test',previousDefaultStatus:'Active',defaultEmploymentStatus:'Active'},events:[]}),'excel-config']);
 await db.query('INSERT INTO organisations VALUES ($1,$2,$3,$4)',['b','next','reordered',JSON.stringify({code:'001',name:'Synthetic Agency'})]);
 await db.exec(`INSERT INTO employees (id,dataset,number,agency,status,search,ready,payload)
 SELECT 'next-'||id,'next',number,'reordered',status,search,ready,
 CASE WHEN number='1' THEN (payload::jsonb||'{"position":"Manager"}'::jsonb)::text ELSE payload END
 FROM employees WHERE dataset='test' AND number IN ('0','1')`);
 const {GET}=await import(pathToFileURL(join(dir,'changes.mjs')));
 const changes=await (await GET(new Request('https://test/api/payroll-changes'))).json();
 assert.equal(changes.changes.some(c=>c.number==='0'),false);
 assert.equal(changes.changes.find(c=>c.number==='1').current_position,'Manager');
 assert.equal(changes.changes.find(c=>c.number==='2').current_status,null);
 assert.ok(changes.next);
 await db.close();console.log('PostgreSQL engine: migrations, valid/invalid/leap/boundary DOBs, status defaults, quality flags, JSON access, parameter handling and aliases passed.');
}finally{rmSync(dir,{recursive:true,force:true});}
