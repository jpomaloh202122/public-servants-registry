import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {deliver,validateDestinations,claimSQL} from '../infra/webhooks/worker.mjs';
import {createHmac} from 'node:crypto';
const db=new PGlite();
const scalar=async sql=>(await db.query(sql)).rows[0];
async function organisation(dataset,key,code,name){
 await db.query('INSERT INTO organisations VALUES($1,$2,$3,$4)',[dataset+':'+key,dataset,key,JSON.stringify({id:key,code,name})]);
}
async function employee(dataset,number,agency,patch={}){
 const payload={id:'emp-'+number,number,first:'Sample',last:'Officer',gender:'Female',dob:'1990-01-01',
  position:'Officer',agency,status:'Not provided',photo:'portraits/test',verified:true,updated:'2026-11-01',...patch};
 await db.query('INSERT INTO employees VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
 [dataset+':'+number,dataset,number,agency,payload.status,'sample officer',0,JSON.stringify(payload)]);
}
async function activate(dataset){
 await db.query("UPDATE registry SET payload=$1,revision=revision+1 WHERE id='excel-config'",
  [JSON.stringify({dataset,source:{asOf:'2026-11-19',fullPayroll:true},events:[]})]);
}
try {
 await db.exec(readFileSync('infra/postgres/001-schema.sql','utf8'));
 await db.exec(readFileSync('infra/postgres/003-payroll-lifecycle.sql','utf8'));
 await organisation('first','org-1','001','Agency A');
 for(const number of ['0001','0002','0003'])await employee('first',number,'org-1');
 await activate('first');
 assert.equal((await scalar('SELECT count(*)::int AS n FROM registry_change_events')).n,0,'First upload establishes the baseline');
 await organisation('second','org-1','002','Agency B');
 await organisation('second','org-2','001','Agency A');
 await employee('second','0001','org-2',{updated:'2026-11-19',sourceRow:80});
 await employee('second','0003','org-1',{position:'Manager'});
 await activate('second');
 const missing=await scalar("SELECT status,payload::jsonb AS record,agency FROM employees WHERE dataset='second' AND number='0002'");
 assert.equal(missing.status,'Inactive');
 assert.equal(missing.record.payrollAbsent,true);
 assert.equal(missing.record.photo,'portraits/test');
 assert.equal(missing.record.verified,true);
 assert.equal(missing.record.statusReason,'Not present in payroll cycle');
 assert.equal((await db.query('SELECT payload::jsonb AS org FROM organisations WHERE dataset=$1 AND key=$2',['second',missing.agency])).rows[0].org.code,'001');
 assert.equal((await scalar("SELECT count(*)::int AS n FROM employees WHERE dataset='first'")).n,3);
 assert.equal((await scalar("SELECT count(*)::int AS n FROM employees WHERE dataset='second'")).n,3);
 const events=(await db.query('SELECT payload FROM registry_change_events ORDER BY employee_number')).rows.map(r=>r.payload);
 assert.equal(events.length,2,'Unchanged fields and import-local agency renumbering must not create events');
 assert.equal(events[0].employeeNumber,'0002');
 assert.equal(events[0].credentialAction,'deactivate');
 assert.equal(events[0].reason,'absent_from_payroll');
 assert.equal(events[1].credentialAction,'review');
 assert.ok(events[1].changedFields.includes('agency'));
 assert.ok(events[1].changedFields.includes('position'));
 assert.equal((await scalar('SELECT count(*)::int AS n FROM registry_webhook_deliveries')).n,4);
 await organisation('third','org-9','001','Agency A');
 await organisation('third','org-2','002','Agency B');
 await employee('third','0001','org-9');
 await employee('third','0003','org-2',{position:'Manager'});
 await activate('third');
 assert.equal((await scalar('SELECT count(*)::int AS n FROM registry_change_events')).n,2,'Repeated absence emits no duplicate deactivation');
 // A retry that writes the same active pointer must not create another event.
 await activate('third');
 assert.equal((await scalar('SELECT count(*)::int AS n FROM registry_change_events')).n,2);
 // Full transaction rollback must also roll back retained rows and queued events.
 await organisation('fourth','org-1','001','Agency A');
 await employee('fourth','0001','org-1');
 await db.exec('BEGIN');
 await activate('fourth');
 await db.exec('ROLLBACK');
 assert.equal((await scalar("SELECT count(*)::int AS n FROM employees WHERE dataset='fourth'")).n,1);
 assert.equal((await scalar('SELECT count(*)::int AS n FROM registry_change_events')).n,2);
 // Pending notifications for an employee are delivered in event sequence with exclusive leases.
 const claim=async(destination,token)=>(await db.query(claimSQL.replaceAll(':p0','$1').replaceAll(':p1','$2'),[destination,token])).rows;
 const firstClaims=await claim('sevispass','first-worker');
 assert.equal(firstClaims.length,2);
 assert.equal((await claim('sevispass','second-worker')).length,0);
 assert.equal((await claim('seviswallet','wallet-worker')).length,2,'Recipient leases are independent');
 await db.exec("UPDATE registry_webhook_deliveries SET lease_until=now()-interval '1 second' WHERE destination='sevispass'");
 const reclaimed=await claim('sevispass','replacement-worker');
 assert.equal(reclaimed.length,2);
 const staleAck=await db.query("UPDATE registry_webhook_deliveries SET delivered_at=now() WHERE event_id=$1 AND destination='sevispass' AND lease_token='first-worker' RETURNING event_id",[reclaimed[0].event_id]);
 assert.equal(staleAck.rows.length,0,'Expired worker must not acknowledge a newer lease');
 await employee('third','0004','org-9',{status:'Suspended'});
 assert.equal((await scalar("SELECT payload->>'credentialAction' AS action FROM registry_change_events WHERE employee_number='0004'")).action,'deactivate');
 await db.exec("UPDATE employees SET status='Terminated' WHERE dataset='third' AND number='0001'");
 assert.equal((await scalar("SELECT payload->>'credentialAction' AS action FROM registry_change_events WHERE employee_number='0001'")).action,'deactivate');
 // Returning to payroll queues review, never automatic credential reactivation.
 await organisation('return','org-1','001','Agency A');
 await employee('return','0002','org-1');
 await activate('return');
 assert.equal((await scalar("SELECT payload->>'credentialAction' AS action FROM registry_change_events WHERE employee_number='0002' ORDER BY seq DESC LIMIT 1")).action,'review');
 await assert.rejects(db.exec("UPDATE employees SET status='Active' WHERE dataset='return' AND number='0001'"),/absent from payroll/);
 await db.exec("UPDATE organisations SET payload=(payload::jsonb||'{\"name\":\"Renamed Agency\"}'::jsonb)::text WHERE dataset='return' AND key='org-1'");
 const orgChange=await scalar("SELECT payload FROM registry_change_events WHERE employee_number='0002' ORDER BY seq DESC LIMIT 1");
 assert.ok(orgChange.payload.changedFields.includes('agency'));
 await assert.rejects(db.query("UPDATE registry SET payload=$1,revision=revision+1 WHERE id='excel-config'",
  [JSON.stringify({dataset:'first',source:{asOf:'2026-11-18',fullPayroll:true}})]),/older than/);
 // Runtime callers can edit employees but cannot call the event-emission function themselves.
 await db.exec('CREATE ROLE lifecycle_app');
 await db.exec('GRANT USAGE ON SCHEMA public TO lifecycle_app');
 await db.exec('GRANT SELECT,UPDATE ON employees,registry TO lifecycle_app');
 await db.exec('SET ROLE lifecycle_app');
 await db.exec("UPDATE employees SET payload=(payload::jsonb||'{\"first\":\"Corrected\"}'::jsonb)::text WHERE dataset='return' AND number='0002'");
 await assert.rejects(db.exec("SELECT registry_emit_change('forged',NULL,'{}'::jsonb,1,'return')"),/permission denied/);
 await db.exec('RESET ROLE');
 const protectedEvent=await scalar("SELECT payload FROM registry_change_events WHERE employee_number='0002' ORDER BY seq DESC LIMIT 1");
 assert.ok(protectedEvent.payload.changedFields.includes('first'));
 assert.ok(protectedEvent.payload.sequence>0);
 await employee('return','orphan','unknown-key');
 await organisation('legacy','a','001','Agency A');
 await employee('legacy','0002','a');
 await activate('legacy');
 const orphan=await scalar("SELECT status,payload::jsonb AS record FROM employees WHERE dataset='legacy' AND number='orphan'");
 assert.equal(orphan.status,'Inactive');
 assert.equal(orphan.record.sourceConflict,true);
 const target={url:'https://partner.example/webhook',signingSecret:'a'.repeat(64)};
 const event={event_id:'test-event',payload:{employeeNumber:'synthetic',credentialAction:'deactivate'}};
 let sent;
 await deliver(event,target,async(url,options)=>{sent={url,...options};return new Response(null,{status:204});},()=>100000);
 assert.equal(sent.headers['X-Registry-Event-Id'],'test-event');
 assert.equal(sent.headers['X-Registry-Signature'],'sha256='+createHmac('sha256',target.signingSecret).update('100.'+sent.body).digest('hex'));
 assert.equal(sent.redirect,'error');
 await assert.rejects(deliver(event,target,async()=>new Response(null,{status:500})),/HTTP 500/);
 assert.throws(()=>validateDestinations({sevispass:{...target,url:'http://partner.example'}}),/Invalid/);
 assert.throws(()=>validateDestinations({sevispass:{...target,signingSecret:'short'}}),/Invalid/);
 console.log('Payroll lifecycle passed: retain missing, inactive, stable agency comparison, no duplicates, rollback, row changes, return review, webhook signature and failed delivery.');
} finally {await db.close();}
