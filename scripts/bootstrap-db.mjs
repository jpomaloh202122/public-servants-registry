import {RDSDataClient,ExecuteStatementCommand} from '@aws-sdk/client-rds-data';
import {SecretsManagerClient,GetSecretValueCommand} from '@aws-sdk/client-secrets-manager';
const region=process.env.REGISTRY_AWS_REGION||process.env.AWS_REGION;
const resourceArn=process.env.DB_CLUSTER_ARN,secretArn=process.env.OWNER_SECRET_ARN;
if(!resourceArn||!secretArn||!process.env.DB_SECRET_ARN)throw Error('Set DB_CLUSTER_ARN, OWNER_SECRET_ARN and DB_SECRET_ARN from the backend stack outputs.');
const sm=new SecretsManagerClient({region}),db=new RDSDataClient({region});
const secret=JSON.parse((await sm.send(new GetSecretValueCommand({SecretId:process.env.DB_SECRET_ARN}))).SecretString);
if(secret.username!=='registry_app'||!/^[a-zA-Z0-9]{40}$/.test(secret.password))throw Error('Unexpected application secret format');
// Password never appears in arguments, files, or output. DDL cannot bind a role password.
const base={resourceArn,secretArn,database:process.env.DB_NAME||'registry'};
const run=sql=>db.send(new ExecuteStatementCommand({...base,sql}));
await run("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='registry_app') THEN CREATE ROLE registry_app LOGIN; END IF; END $$;");
await run("ALTER ROLE registry_app PASSWORD '"+secret.password+"'");
await run('GRANT CONNECT ON DATABASE registry TO registry_app');
// Schema migrations run with the owner credential, never the runtime credential.
const old=process.env.DB_SECRET_ARN;process.env.DB_SECRET_ARN=secretArn;
await import('./migrate-db.mjs');process.env.DB_SECRET_ARN=old;
await run('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
await run('GRANT USAGE ON SCHEMA public TO registry_app');
await run('GRANT SELECT,INSERT,UPDATE,DELETE ON registry,employees,organisations,audit_events TO registry_app');
await run('REVOKE ALL ON FUNCTION registry_valid_dob(text) FROM PUBLIC');
await run('GRANT EXECUTE ON FUNCTION registry_valid_dob(text) TO registry_app');
console.log('Restricted runtime database user configured.');
