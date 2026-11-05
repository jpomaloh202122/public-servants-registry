import {RDSDataClient,ExecuteStatementCommand} from '@aws-sdk/client-rds-data';
import {readFileSync} from 'node:fs';
const client=new RDSDataClient({region:process.env.REGISTRY_AWS_REGION||process.env.AWS_REGION});
const {DB_CLUSTER_ARN:resourceArn,DB_SECRET_ARN:secretArn}=process.env;
if(!resourceArn||!secretArn)throw Error('DB_CLUSTER_ARN and DB_SECRET_ARN are required.');
const base={resourceArn,secretArn,database:process.env.DB_NAME||'registry'};
// Data API executes one statement per call. Keep PL/pgSQL function intact.
for(const sql of readFileSync('infra/postgres/001-schema.sql','utf8').split(';').filter(s=>s.trim()))await client.send(new ExecuteStatementCommand({...base,sql}));
await client.send(new ExecuteStatementCommand({...base,sql:readFileSync('infra/postgres/002-valid-dob.sql','utf8')}));
console.log('PostgreSQL registry schema ready; existing records preserved.');
