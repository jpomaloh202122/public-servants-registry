import ts from 'typescript';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'registry-db-tests-'));
try{
 for(const [src,name] of [['app/model.ts','model'],['app/quality.ts','quality'],['app/database-sql.ts','database-sql'],['tests/database-sql.test.ts','test'],['app/api/database-export/route.ts','route'],['tests/database-route.test.ts','route-test']]){
 const text=readFileSync(src,'utf8').replaceAll("'./model'","'./model.mjs'").replaceAll("'./quality'","'./quality.mjs'").replaceAll("'../../quality'","'./quality.mjs'").replaceAll("'../app/database-sql'","'./database-sql.mjs'").replaceAll("'../../database-sql'","'./database-sql.mjs'").replaceAll("'../app/api/database-export/route'","'./route.mjs'").replaceAll("'@/lib/aws-runtime'","'./mock.mjs'").replaceAll("'../../chatgpt-auth'","'./mock.mjs'").replaceAll("'../../server-registry'","'./mock.mjs'");
 writeFileSync(join(dir,name+'.mjs'),ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
 }

 await import(pathToFileURL(join(dir,'test.mjs')).href);
 let calls=0;
 const context={user:true,change:false,statements:[],reset(){calls=0;this.change=false;this.statements=[];},env:{DB:{prepare(sql){context.statements.push(sql);return {bind(...args){return {async first(){return {n:1001};},async all(){if(sql.includes('organisations'))return {results:[{payload:JSON.stringify({id:'o1',code:'001',name:'Test',type:'Organisation'})}]};const cursor=String(args.at(-1));const start=cursor?Number(cursor):0;return {results:Array.from({length:Math.min(500,1001-start)},(_,i)=>{const n=start+i+1;return {number:String(n).padStart(6,'0'),payload:JSON.stringify({id:'e'+n,number:String(n).padStart(6,'0'),first:'Test',last:'Employee',gender:'',dob:'',position:'Officer',agency:'o1',status:'Not provided',photo:'',verified:false,updated:'2026-11-03T00:00:00Z'})};})};}};}};}}}};
 globalThis.__databaseTest=context;
 context.config=async()=>({dataset:'a'.repeat(64),revision:context.change&&++calls>1?2:1,source:{source:'test.xlsx',sourceRows:1001,uniqueEmployees:1001}});
 writeFileSync(join(dir,'mock.mjs'),`export const env=globalThis.__databaseTest.env;export const getChatGPTUser=async()=>globalThis.__databaseTest.user?{userId:'test'}:null;export const config=()=>globalThis.__databaseTest.config();`);
 await import(pathToFileURL(join(dir,'route-test.mjs')).href);

}finally{rmSync(dir,{recursive:true,force:true});}
