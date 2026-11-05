import {RDSDataClient, ExecuteStatementCommand} from '@aws-sdk/client-rds-data';

const {DB_CLUSTER_ARN:resourceArn, DB_SECRET_ARN:secretArn, REGISTRY_AWS_REGION:region} = process.env;
if (!resourceArn || !secretArn || !region) throw Error('Staging database connection is required.');
const client = new RDSDataClient({region});

// The caller resolves these credentials from the staging stack only.
// Lock configuration and leave any existing dataset untouched.
const sql = `DO $$
DECLARE current_dataset text;
BEGIN
 SELECT payload::jsonb->>'dataset' INTO current_dataset FROM registry WHERE id='excel-config' FOR UPDATE;
 IF current_dataset = 'synthetic-staging' THEN RETURN; END IF;
 IF current_dataset IS DISTINCT FROM '' THEN
   RAISE EXCEPTION 'Staging seed requires an empty active dataset';
 END IF;
 IF EXISTS (SELECT 1 FROM employees) OR EXISTS (SELECT 1 FROM organisations) THEN
   RAISE EXCEPTION 'Staging seed requires an empty registry';
 END IF;
 INSERT INTO organisations VALUES ('synthetic-staging:demo','synthetic-staging','demo',
  '{"id":"demo","code":"TEST","name":"Synthetic Agency","type":"Organisation"}');
 INSERT INTO employees VALUES ('synthetic-staging:000123','synthetic-staging','000123','demo','Active',
  'synthetic officer 000123',0,
  '{"id":"emp-000123","number":"000123","first":"Synthetic","last":"Officer","gender":"F","dob":"1990-01-01","position":"Test Officer","agency":"demo","status":"Active","photo":"","verified":false,"updated":"2026-11-06T00:00:00Z"}');
 UPDATE registry SET revision=revision+1,payload=
  '{"dataset":"synthetic-staging","source":{"source":"Synthetic SevisPass staging fixture","sourceRows":1,"uniqueEmployees":1,"statusProvided":true,"asOf":"2026-11-06"},"events":[]}'
 WHERE id='excel-config';
END $$`;

await client.send(new ExecuteStatementCommand({resourceArn,secretArn,database:process.env.DB_NAME||'registry',sql}));
console.log('Synthetic staging employee 000123 is available. Employee Number 000124 is absent.');
