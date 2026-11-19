import {createHmac, randomUUID} from 'node:crypto';
import {RDSDataClient, ExecuteStatementCommand} from '@aws-sdk/client-rds-data';
import {SecretsManagerClient, GetSecretValueCommand} from '@aws-sdk/client-secrets-manager';
const db = new RDSDataClient({});
const secrets = new SecretsManagerClient({});
const base = {resourceArn: process.env.DB_CLUSTER_ARN, secretArn: process.env.DB_SECRET_ARN, database: 'registry'};
async function query(sql, values = []) {
 const result = await db.send(new ExecuteStatementCommand({...base, sql,
  parameters: values.map((value, i) => ({name: 'p'+i, value: {stringValue: String(value)}})),
  formatRecordsAs: 'JSON'}));
 return JSON.parse(result.formattedRecords || '[]');
}
export async function deliver(row, destination, send = fetch, now = Date.now) {
 const body = JSON.stringify(row.payload);
 const timestamp = String(Math.floor(now() / 1000));
 const signature = createHmac('sha256', destination.signingSecret).update(timestamp+'.'+body).digest('hex');
 const response = await send(destination.url, {method: 'POST', redirect: 'error',
  headers: {'Content-Type':'application/json', 'X-Registry-Event-Id':row.event_id,
   'X-Registry-Timestamp':timestamp, 'X-Registry-Signature':'sha256='+signature},
  body, signal: AbortSignal.timeout(5000)});
 // Never retain or log a recipient's body.
 await response.body?.cancel();
 if (!response.ok) throw Error('HTTP '+response.status);
}
export function validateDestinations(config) {
 if (!config || typeof config !== 'object' || Array.isArray(config)) throw Error('Invalid webhook configuration');
 for (const name of ['sevispass','seviswallet']) {
  const value = config[name];
  if (!value) continue;
  let url;
  try { url = new URL(value.url); }
  catch { throw Error('Invalid webhook configuration for '+name); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
      typeof value.signingSecret !== 'string' || value.signingSecret.length < 32)
   throw Error('Invalid webhook configuration for '+name);
 }
 return config;
}
export const claimSQL = `WITH candidates AS (
   SELECT d.event_id,d.destination FROM registry_webhook_deliveries d
   JOIN registry_change_events e ON e.id=d.event_id
   WHERE d.destination=:p0 AND d.delivered_at IS NULL AND d.next_attempt_at<=now()
    AND (d.lease_until IS NULL OR d.lease_until<now())
    AND NOT EXISTS (SELECT 1 FROM registry_webhook_deliveries earlier
      JOIN registry_change_events prior ON prior.id=earlier.event_id
      WHERE earlier.destination=d.destination AND earlier.delivered_at IS NULL
       AND prior.employee_number=e.employee_number AND prior.seq<e.seq)
   ORDER BY e.seq LIMIT 25 FOR UPDATE OF d SKIP LOCKED
  ), claimed AS (
   UPDATE registry_webhook_deliveries d SET lease_until=now()+interval '2 minutes',lease_token=:p1,attempts=d.attempts+1
   FROM candidates c WHERE d.event_id=c.event_id AND d.destination=c.destination RETURNING d.event_id
  ) SELECT e.id AS event_id,e.payload FROM claimed c JOIN registry_change_events e ON e.id=c.event_id ORDER BY e.seq`;
export async function handler() {
 const secret = await secrets.send(new GetSecretValueCommand({SecretId: process.env.WEBHOOK_SECRET_ARN}));
 const config = validateDestinations(JSON.parse(secret.SecretString));
 let sent = 0;
 const deadline = Date.now()+90000;
 let claimed;
 do {
 claimed = 0;
 for (const destination of ['sevispass','seviswallet']) {
  if (!config[destination] || Date.now()>=deadline) continue;
  // Lease with a fencing token. An expired worker cannot overwrite a later worker's acknowledgement.
  const token = randomUUID();
  const rows = await query(claimSQL,[destination,token]);
  claimed += rows.length;
  for (let index=0; index<rows.length && Date.now()<deadline; index+=5) {
   await Promise.all(rows.slice(index,index+5).map(async row => {
   try {
    await deliver(row, config[destination]);
    await query(`UPDATE registry_webhook_deliveries SET delivered_at=now(),lease_until=NULL,last_error=NULL
      WHERE event_id=:p0 AND destination=:p1 AND lease_token=:p2`,[row.event_id,destination,token]);
    sent++;
   } catch (error) {
    // Only a status code is retained. URLs, credentials and recipient bodies stay out of logs.
    const code = /^HTTP [0-9]{3}$/.test(error.message) ? error.message : 'Delivery or acknowledgement failed';
    await query(`UPDATE registry_webhook_deliveries SET lease_until=NULL,last_error=:p3,
      next_attempt_at=now()+make_interval(secs=>LEAST(3600,30*power(2,LEAST(attempts,7)))::int)
      WHERE event_id=:p0 AND destination=:p1 AND lease_token=:p2`,[row.event_id,destination,token,code]);
   }
   }));
  }
 }
 } while (claimed && Date.now()<deadline);
 console.log(JSON.stringify({event:'registry.webhooks',sent}));
 return {sent};
}
