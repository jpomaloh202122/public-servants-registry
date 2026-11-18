import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';

const region = process.env.AWS_REGION || 'ap-southeast-2';
const stack = process.argv[2] || 'ps-id-registry-backend';
function aws(service, operation, payload) {
  const directory = mkdtempSync(join(tmpdir(), 'sevispass-db-'));
  try {
    const file = join(directory, 'input.json');
    writeFileSync(file, JSON.stringify(payload), {mode: 0o600});
    return JSON.parse(execFileSync('aws', [service, operation, '--region', region,
      '--cli-input-json', 'file://' + file, '--output', 'json'],
    {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}));
  } catch (error) {
    // AWS errors can echo SQL containing credentials. Never print the raw error.
    const missing = String(error.stderr || '').includes('ResourceNotFoundException');
    const safe = new Error(service + ' ' + operation + ' failed. Review AWS permissions and resource state.');
    safe.missing = missing;
    throw safe;
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}
try {
  const identity = aws('sts', 'get-caller-identity', {});
  if (identity.Account !== '440660366630') throw Error('Use the approved registry AWS account.');
  const details = aws('cloudformation', 'describe-stacks', {StackName: stack}).Stacks[0];
  const outputs = Object.fromEntries(details.Outputs.map(item => [item.OutputKey, item.OutputValue]));
  const base = {resourceArn: outputs.DbClusterArn, secretArn: outputs.OwnerSecretArn, database: outputs.DbName};
  if (!base.resourceArn || !base.secretArn || base.database !== 'registry') throw Error('Unexpected registry stack outputs.');
  const cluster = aws('rds', 'describe-db-clusters', {DBClusterIdentifier: base.resourceArn}).DBClusters[0];
  const secretName = stack + '/sevispass-db-reader';
  let secret;
  try {
    secret = aws('secretsmanager', 'get-secret-value', {SecretId: secretName});
  } catch (error) {
    if (!error.missing) throw error;
    // Avoid taking over a pre-existing role without its managed credential.
    const existing = aws('rds-data', 'execute-statement', {...base,
      sql: "SELECT 1 FROM pg_roles WHERE rolname='sevispass_reader'"});
    if (existing.records.length) throw Error('Existing sevispass_reader requires administrator review.');
    aws('secretsmanager', 'create-secret', {Name: secretName,
      Description: 'SevisPass read-only registry database credential',
      SecretString: JSON.stringify({username: 'sevispass_reader', password: randomBytes(30).toString('hex')})});
    secret = aws('secretsmanager', 'get-secret-value', {SecretId: secretName});
  }
  const credentials = JSON.parse(secret.SecretString);
  if (credentials.username !== 'sevispass_reader' || !/^[a-f0-9]{60}$/.test(credentials.password))
    throw Error('Unexpected SevisPass secret format.');
  const transactionId = aws('rds-data', 'begin-transaction', base).transactionId;
  const run = sql => aws('rds-data', 'execute-statement', {...base, transactionId, sql});
  try {
    for (const sql of readFileSync(new URL('../infra/postgres/sevispass-reader.sql', import.meta.url), 'utf8').split('\n-- statement\n'))
      if (sql.trim()) run(sql);
    run("ALTER ROLE sevispass_reader PASSWORD '" + credentials.password + "'");
    aws('rds-data', 'commit-transaction', {resourceArn: base.resourceArn, secretArn: base.secretArn, transactionId});
  } catch (error) {
    aws('rds-data', 'rollback-transaction', {resourceArn: base.resourceArn, secretArn: base.secretArn, transactionId});
    throw error;
  }
  console.log(JSON.stringify({host: cluster.Endpoint, port: cluster.Port, database: base.database,
    username: 'sevispass_reader', sslmode: 'verify-full', view: 'sevispass.employees',
    secretArn: secret.ARN, network: 'Private endpoint. Approve the SevisPass network route and inbound source before connecting.'}, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
