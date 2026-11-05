import {randomUUID} from 'node:crypto';
import {env} from '@/lib/aws-runtime';
import {verifySevisPassToken} from '@/lib/sevispass-auth';
import {config} from '../../../../server-registry';
import {effectiveEmployee} from '../../../../quality';
import {ready, type Employee} from '../../../../model';

export async function POST(request: Request) {
  const requestId = randomUUID();
  function reply(body: Record<string, unknown>, status = 200) {
    console.info(JSON.stringify({event: 'sevispass.eligibility', requestId, status}));
    return Response.json({...body, requestId}, {
      status,
      headers: {'Cache-Control': 'no-store', ...(status === 401 ? {'WWW-Authenticate': 'Bearer'} : {})},
    });
  }

  const issuer = process.env.SEVISPASS_TOKEN_ISSUER;
  const audience = process.env.SEVISPASS_TOKEN_AUDIENCE;
  const clientId = process.env.SEVISPASS_CLIENT_ID;
  if (!issuer || !audience || !clientId) return reply({error: 'integration_unavailable'}, 503);

  const token = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return reply({error: 'unauthorized'}, 401);
  try {
    if (!await verifySevisPassToken(token, {issuer, audience, clientId})) {
      return reply({error: 'forbidden'}, 403);
    }
  } catch {
    return reply({error: 'unauthorized'}, 401);
  }

  const body: unknown = await request.json().catch(() => null);
  const number = body && typeof body === 'object' && 'employeeNumber' in body ? body.employeeNumber : null;
  if (typeof number !== 'string' || !number || number.length > 100 || number !== number.trim() || /[\u0000-\u001f\u007f]/.test(number)) {
    return reply({error: 'invalid_employee_number'}, 400);
  }

  try {
    const current = await config();
    if (!current.dataset) return reply({error: 'payroll_cycle_unavailable'}, 503);
    const row = await env.DB.prepare('SELECT payload FROM employees WHERE dataset=? AND number=?')
      .bind(current.dataset, number).first<{payload: string}>();
    const context = {datasetRevision: Number(current.revision), payrollCycle: current.source?.asOf ?? null};
    if (!row) return reply({decision: 'not_found', ...context});

    const employee = effectiveEmployee(JSON.parse(row.payload) as Employee, current.source);
    const excluded = employee.status === 'Terminated' || employee.status === 'Retired';
    return reply({
      employeeNumber: number,
      decision: excluded ? 'ineligible' : 'pending_review',
      registryReady: ready(employee),
      ...context,
    });
  } catch {
    return reply({error: 'registry_unavailable'}, 503);
  }
}
