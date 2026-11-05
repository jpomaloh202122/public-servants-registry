import 'server-only';
import Database from 'better-sqlite3';
import {mkdirSync,readFileSync,readdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {S3Client,PutObjectCommand,GetObjectCommand,HeadObjectCommand} from '@aws-sdk/client-s3';
let database:Database.Database|undefined;
function db(){
 if(database)return database;
 const path=process.env.DATABASE_PATH||'./data/registry.sqlite';mkdirSync(dirname(path),{recursive:true});
 database=new Database(path);database.pragma('journal_mode = WAL');database.pragma('busy_timeout = 10000');
 for(const name of readdirSync(join(process.cwd(),'drizzle')).filter(n=>n.endsWith('.sql')).sort()){
  const sql=readFileSync(join(process.cwd(),'drizzle',name),'utf8').replace(/CREATE TABLE /g,'CREATE TABLE IF NOT EXISTS ').replace(/CREATE UNIQUE INDEX /g,'CREATE UNIQUE INDEX IF NOT EXISTS ').replace(/CREATE INDEX /g,'CREATE INDEX IF NOT EXISTS ');
  database.exec(sql);
 }
 database.prepare("INSERT OR IGNORE INTO registry(id,revision,payload) VALUES ('excel-config',0,'{\"dataset\":\"\",\"source\":null,\"events\":[]}')").run();
 return database;
}
class Statement{
 constructor(readonly sql:string,readonly args:any[]=[]){ }
 bind(...args:any[]){return new Statement(this.sql,args);}
 async first<T=any>():Promise<T|null>{return (db().prepare(this.sql).get(...this.args) as T)||null;}
 async all<T=any>():Promise<{results:T[]}>{return {results:db().prepare(this.sql).all(...this.args) as T[]};}
 async run(){const r=db().prepare(this.sql).run(...this.args);return {meta:{changes:r.changes}};}
}
const s3=new S3Client({});
function bucket(){if(!process.env.S3_BUCKET)throw Error('S3_BUCKET is required');return process.env.S3_BUCKET;}
function absent(e:unknown){return (e as any)?.$metadata?.httpStatusCode===404;}
export const env={
 DB:{prepare:(sql:string)=>new Statement(sql),async batch(statements:Statement[]){return db().transaction(()=>statements.map(s=>{const r=db().prepare(s.sql).run(...s.args);return {meta:{changes:r.changes}};}))();}},
 BUCKET:{
 async put(key:string,body:any,options?:{httpMetadata?:{contentType?:string}}){
  let bytes=body;if(body instanceof ReadableStream)bytes=new Uint8Array(await new Response(body).arrayBuffer());
  await s3.send(new PutObjectCommand({Bucket:bucket(),Key:key,Body:bytes,ContentType:options?.httpMetadata?.contentType}));
 },
 async head(key:string){try{return await s3.send(new HeadObjectCommand({Bucket:bucket(),Key:key}));}catch(e){if(absent(e))return null;throw e;}},
 async get(key:string){try{const o=await s3.send(new GetObjectCommand({Bucket:bucket(),Key:key}));return {body:o.Body?.transformToWebStream() as ReadableStream<Uint8Array>,httpMetadata:{contentType:o.ContentType}};}catch(e){if(absent(e))return null;throw e;}}
 }
};
