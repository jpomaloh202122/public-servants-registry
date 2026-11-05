import ts from 'typescript';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
mkdirSync('work',{recursive:true});const dir=mkdtempSync(join(process.cwd(),'work','aws-runtime-'));
process.env.DB_DRIVER='sqlite';process.env.DATABASE_PATH=join(dir,'registry.sqlite');
try{
 const source=readFileSync('lib/aws-runtime.ts','utf8').replace("import 'server-only';",'').replace("'./data-api'","'./data-api.mjs'");
 for(const name of ['data-api','postgres-sql'])writeFileSync(join(dir,name+'.mjs'),ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8').replace("'./postgres-sql'","'./postgres-sql.mjs'"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
 const output=join(dir,'runtime.mjs');writeFileSync(output,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
 const {env}=await import(pathToFileURL(output));
 const cfg=await env.DB.prepare('SELECT payload FROM registry WHERE id=?').bind('excel-config').first();assert.equal(JSON.parse(cfg.payload).dataset,'');
 await env.DB.batch([env.DB.prepare('INSERT INTO registry VALUES (?,0,?)').bind('test','{}')]);
 assert.equal((await env.DB.prepare('SELECT id FROM registry WHERE id=?').bind('test').all()).results.length,1);
 await assert.rejects(env.DB.batch([env.DB.prepare('INSERT INTO registry VALUES (?,0,?)').bind('rollback','{}'),env.DB.prepare('INSERT INTO registry VALUES (?,0,?)').bind('test','{}')]));
 assert.equal(await env.DB.prepare('SELECT id FROM registry WHERE id=?').bind('rollback').first(),null);
 const result=await env.DB.prepare('UPDATE registry SET revision=revision+1 WHERE id=? AND revision=?').bind('test',9).run();assert.equal(result.meta.changes,0);
 process.env.NODE_ENV='production';assert.equal(env.DB.dialect,'postgres');delete process.env.NODE_ENV;
 console.log('AWS runtime: real SQLite initialization, parameter binding, reads, transactional rollback and revision conflict results passed.');
}finally{rmSync(dir,{recursive:true,force:true});}
