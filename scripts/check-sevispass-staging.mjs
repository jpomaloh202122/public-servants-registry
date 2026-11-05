// Run against staging with synthetic employees only. Read the service token from stdin.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const [origin, present, missing] = process.argv.slice(2);
if (!origin || !present || !missing || present === missing) {
  throw Error('Usage: node scripts/check-sevispass-staging.mjs HTTPS_ORIGIN PRESENT_NUMBER MISSING_NUMBER');
}
const base = new URL(origin);
assert.equal(base.protocol, 'https:', 'Use an HTTPS staging origin');
const url = new URL('/api/v1/sevispass/eligibility', base);
const token = readFileSync(0, 'utf8').trim();
assert.ok(token, 'Supply the service access token on stdin');
const allowedFields = new Set(['employeeNumber', 'decision', 'registryReady', 'datasetRevision', 'payrollCycle', 'requestId']);

async function lookup(number, bearer, expectedStatus) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', ...(bearer ? {Authorization: 'Bearer ' + bearer} : {})},
    body: JSON.stringify({employeeNumber: number}),
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, expectedStatus, 'Unexpected HTTP status');
  if (expectedStatus !== 200) return;
  const result = await response.json();
  assert.ok(Object.keys(result).every(key => allowedFields.has(key)), 'Unexpected response fields');
  assert.ok(Number.isInteger(result.datasetRevision), 'Missing dataset revision');
  assert.equal(typeof result.requestId, 'string');
  return result;
}

await lookup(present, '', 401);
await lookup(present, 'invalid-token', 401);
await lookup(123, token, 400);
const found = await lookup(present, token, 200);
assert.equal(found.employeeNumber, present, 'Employee Number must match exactly');
assert.equal(found.decision, 'pending_review', 'Use an active synthetic employee');
assert.equal(typeof found.registryReady, 'boolean');
const absent = await lookup(missing, token, 200);
assert.equal(absent.decision, 'not_found');
assert.ok(!('employeeNumber' in absent) && !('registryReady' in absent));
assert.equal(absent.datasetRevision, found.datasetRevision, 'Retry against a stable dataset revision');
console.log('PASS: service authentication, exact Employee Number, missing record and response field checks.');
