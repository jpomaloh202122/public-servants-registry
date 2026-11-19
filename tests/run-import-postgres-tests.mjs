import assert from 'node:assert/strict';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const directory=mkdtempSync(join(tmpdir(),'registry-activation-'));
const db=new PGlite();
try {
 for(const [path,name] of [['app/model.ts','model'],['app/quality.ts','quality'],['app/quality-postgres.ts','quality-postgres'],
  ['app/server-registry.ts','server-registry'],['lib/postgres-sql.ts','postgres-sql'],['app/api/imports/route.ts','route'],['app/api/payroll-changes/route.ts','changes']]){
  const source=readFileSync(path,'utf8')
   .replace(/from '\.\/([^']+)'/g,"from './$1.mjs'")
   .replaceAll("'../../server-registry'","'./server-registry.mjs'")
   .replaceAll("'../../model'","'./model.mjs'")
   .replace(/'(@\/lib\/(aws-runtime|object-storage)|\.\.\/\.\.\/chatgpt-auth)'/g,"'./runtime.mjs'");
  writeFileSync(join(directory,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
 }
 const {postgresSQL}=await import(pathToFileURL(join(directory,'postgres-sql.mjs')));
 const run=(sql,args=[])=>{
  const parsed=postgresSQL(sql).sql.replace(/:p([0-9]+)/g,(_,i)=>'$'+(Number(i)+1));
  return db.query(parsed,args);
 };
 globalThis.__activationFixture={DB:{dialect:'postgres',prepare(sql){return {bind(...args){return {
  async first(){return (await run(sql,args)).rows[0]||null;},
  async all(){return {results:(await run(sql,args)).rows};},
  async run(){return {meta:{changes:(await run(sql,args)).affectedRows}};}
 };},async first(){return (await run(sql)).rows[0]||null;},async all(){return {results:(await run(sql)).rows};}};}},
 BUCKET:{async head(){return {ContentLength:1};}}};
 writeFileSync(join(directory,'runtime.mjs'),"export const env=globalThis.__activationFixture;export const getChatGPTUser=async()=>({userId:'owner',displayName:'Test'});export const uploadURL=async()=>'';export const downloadURL=async()=>'';");
 await db.exec(readFileSync('infra/postgres/001-schema.sql','utf8'));
 await db.exec(readFileSync('infra/postgres/003-payroll-lifecycle.sql','utf8'));
 await db.exec(`INSERT INTO organisations VALUES ('old:a','old','a','{"id":"a","code":"001","name":"Agency"}');
 INSERT INTO employees VALUES('old:0001','old','0001','a','Active','sample',0,'{"id":"emp-0001","number":"0001","first":"Sample","last":"Officer","agency":"a","status":"Active","photo":"portraits/test","verified":true}');
 UPDATE registry SET payload='{"dataset":"old","source":{"asOf":"2026-11-18"},"events":[]}',revision=1 WHERE id='excel-config';`);
 const id='a'.repeat(64);
 const metadata={id,owner:'owner',filename:'test.csv',state:'staging',archived:true,fileKey:'uploads/'+id+'/original',
  payrollCycle:'2026-11-19',baseRevision:1,expected:1,created:'2026-11-19T00:00:00Z',organisations:[{id:'a',code:'002',name:'Another Agency'}]};
 await db.query('INSERT INTO registry VALUES($1,0,$2)',['source-upload:'+id,JSON.stringify(metadata)]);
 await db.query('INSERT INTO organisations VALUES($1,$2,$3,$4)',[id+':a',id,'a','{"id":"a","code":"002","name":"Another Agency"}']);
 await db.query('INSERT INTO employees VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
 [id+':0002',id,'0002','a','Active','sample',0,'{"id":"emp-0002","number":"0002","first":"Other","last":"Officer","agency":"a","status":"Active"}']);
 const {POST}=await import(pathToFileURL(join(directory,'route.mjs')));
 const request=body=>new Request('https://registry.test/api/imports?action=activate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,confirm:true,...body})});
 assert.equal((await POST(request({}))).status,400,'Full-period confirmation required');
 const response=await POST(request({fullPayroll:true}));
 assert.equal(response.status,200,await response.text());
 assert.equal((await db.query('SELECT status FROM employees WHERE dataset=$1 AND number=$2',[id,'0001'])).rows[0].status,'Inactive');
 assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM registry_change_events')).rows[0].n,2);
 // Simulate a lost final response / failed upload metadata save after activation.
 await db.query('UPDATE registry SET payload=$1 WHERE id=$2',[JSON.stringify(metadata),'source-upload:'+id]);
 assert.equal((await POST(request({fullPayroll:true}))).status,200);
 assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM registry_change_events')).rows[0].n,2);
 const changes=await import(pathToFileURL(join(directory,'changes.mjs')));
 const comparison=await (await changes.GET(new Request('https://registry.test/api/payroll-changes'))).json();
 assert.equal(comparison.changes.length,2);
 assert.equal(comparison.changes.find(row=>row.number==='0001').current_status,'Inactive');
 assert.equal(comparison.changes.find(row=>row.number==='0002').previous_status,null);
 assert.equal(comparison.webhooks.length,2);
 console.log('PostgreSQL import entry point passed: explicit full period, retained inactive, queued events, activation retry after lost response.');
} finally {await db.close();rmSync(directory,{recursive:true,force:true});}
