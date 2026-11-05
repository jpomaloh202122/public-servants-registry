import ts from 'typescript';import assert from 'node:assert/strict';import {RDSDataClient} from '@aws-sdk/client-rds-data';import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
mkdirSync('work',{recursive:true});const dir=mkdtempSync(join(process.cwd(),'work','data-api-'));const original=RDSDataClient.prototype.send;
try{
 for(const name of ['data-api','postgres-sql'])writeFileSync(join(dir,name+'.mjs'),ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8').replace("'./postgres-sql'","'./postgres-sql.mjs'"),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText);
 process.env.DB_CLUSTER_ARN='test-cluster';process.env.DB_SECRET_ARN='test-secret';let calls=[],conflict=false;
 RDSDataClient.prototype.send=async function(command){calls.push({type:command.constructor.name,input:command.input});switch(command.constructor.name){case 'BeginTransactionCommand':return {transactionId:'test-tx'};case 'ExecuteStatementCommand':return command.input.sql.startsWith('SELECT')?{formattedRecords:'[{"total":2,"payload":"{}"}]'}:{numberOfRecordsUpdated:conflict?0:1};case 'BatchExecuteStatementCommand':return {updateResults:command.input.parameterSets.map(()=>({}))};default:return {};}};
 const api=await import(pathToFileURL(join(dir,'data-api.mjs')));
 assert.equal((await api.execute('SELECT ? AS total',[2])).results[0].total,2);assert.equal(calls[0].input.formatRecordsAs,'JSON');assert.equal(calls[0].input.parameters[0].value.longValue,2);
 calls=[];await api.dataApiBatch([{sql:'INSERT INTO test VALUES (?)',args:['a']},{sql:'INSERT INTO test VALUES (?)',args:['b']},{sql:'UPDATE test SET v=?',args:['c'],expectedChanges:1}]);assert.deepEqual(calls.map(c=>c.type),['BeginTransactionCommand','BatchExecuteStatementCommand','ExecuteStatementCommand','CommitTransactionCommand']);
 calls=[];conflict=true;await assert.rejects(api.dataApiBatch([{sql:'UPDATE test SET v=?',args:['c'],expectedChanges:1}]));assert.equal(calls.at(-1).type,'RollbackTransactionCommand');assert.ok(!calls.some(c=>c.type==='CommitTransactionCommand'));
 await assert.rejects(api.execute('SELECT ?',[1,2]));
 console.log('Data API contract: bound values, formatted JSON decoding, grouped writes, transaction commit and conflict rollback passed (mock transport).');
}finally{RDSDataClient.prototype.send=original;rmSync(dir,{recursive:true,force:true});}
