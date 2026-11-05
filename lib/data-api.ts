import {RDSDataClient,ExecuteStatementCommand,BeginTransactionCommand,CommitTransactionCommand,RollbackTransactionCommand,BatchExecuteStatementCommand,type SqlParameter,type Field} from '@aws-sdk/client-rds-data';
import {postgresSQL} from './postgres-sql';
const client=new RDSDataClient({region:process.env.REGISTRY_AWS_REGION||process.env.AWS_REGION});
function connection(){
 const resourceArn=process.env.DB_CLUSTER_ARN,secretArn=process.env.DB_SECRET_ARN;
 if(!resourceArn||!secretArn)throw Error('Configure DB_CLUSTER_ARN and DB_SECRET_ARN before using the registry.');
 return {resourceArn,secretArn,database:process.env.DB_NAME||'registry'};
}
function parameters(args:unknown[]):SqlParameter[]{return args.map((v,i)=>({name:'p'+i,value:v==null?{isNull:true}:typeof v==='number'?{longValue:v}:typeof v==='boolean'?{booleanValue:v}:{stringValue:String(v)}}));}
function value(f:Field){if(f.isNull)return null;return f.stringValue??f.longValue??f.doubleValue??f.booleanValue??null;}
export async function execute(sql:string,args:unknown[]=[],transactionId?:string){
 const converted=postgresSQL(sql);if(converted.count!==args.length)throw Error('SQL parameter count mismatch');
 const r=await client.send(new ExecuteStatementCommand({...connection(),sql:converted.sql,parameters:parameters(args),transactionId,formatRecordsAs:'JSON',includeResultMetadata:true}));
 const columns=r.columnMetadata||[];
 return {results:(r.formattedRecords?JSON.parse(r.formattedRecords):(r.records||[]).map(row=>Object.fromEntries(row.map((f,i)=>[columns[i].name||String(i),value(f)])))),meta:{changes:r.numberOfRecordsUpdated||0}};
}
export async function dataApiBatch(statements:{sql:string;args:unknown[];expectedChanges?:number}[]){
 if(!statements.length)return [];
 const connectionInfo=connection();const begun=await client.send(new BeginTransactionCommand(connectionInfo));const transactionId=begun.transactionId!;
 try{
  const results=[];
  // Group identical parameterised inserts into one Data API request per template.
  for(let i=0;i<statements.length;){const first=statements[i];let end=i+1;
   while(end<statements.length&&end<i+50&&statements[end].sql===first.sql&&first.expectedChanges===undefined&&statements[end].expectedChanges===undefined)end++;
   if(end-i>1){const converted=postgresSQL(first.sql);for(const s of statements.slice(i,end))if(converted.count!==s.args.length)throw Error('SQL parameter count mismatch');
    const r=await client.send(new BatchExecuteStatementCommand({...connectionInfo,transactionId,sql:converted.sql,parameterSets:statements.slice(i,end).map(s=>parameters(s.args))}));results.push(...(r.updateResults||[]).map(()=>({meta:{changes:1}})));
   }else{const r=await execute(first.sql,first.args,transactionId);if(first.expectedChanges!==undefined&&r.meta.changes!==first.expectedChanges)throw Error('Concurrent registry change; refresh and retry.');results.push(r);}
   i=end;
  }
  await client.send(new CommitTransactionCommand({...connectionInfo,transactionId}));return results;
 }catch(error){await client.send(new RollbackTransactionCommand({...connectionInfo,transactionId})).catch(()=>{});throw error;}
}
