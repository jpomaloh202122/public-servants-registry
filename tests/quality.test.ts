import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assess, type Servant} from '../lib/quality';
const base: Servant={id:'1',payrollNumber:'1',name:'Test',agencyCode:'001',dob:'1980-11-06',photoVerified:true,identityVerified:true,approved:true};
test('age uses birthday, and valid approved identity is eligible',()=>{const [r]=assess([base],['001'],'2026-11-05');assert.equal(r.age,45);assert.equal(r.ready,true)});
test('impossible and future dates block integration',()=>{for(const dob of ['1980-02-30','2027-01-01','bad']) assert.equal(assess([{...base,dob}],['001'],'2026-11-05')[0].ready,false)});
test('duplicates block both records',()=>{const rows=assess([base,{...base,id:'2'}],['001'],'2026-11-05');assert.ok(rows.every(r=>r.issues.includes('Duplicate payroll number')&&!r.ready))});
test('age boundary and identity gates',()=>{for(const dob of ['2008-11-06','1960-11-05'])assert.equal(assess([{...base,dob}],['001'],'2026-11-05')[0].ready,false);for(const patch of [{photoVerified:false},{identityVerified:false},{approved:false},{agencyCode:'999'}])assert.equal(assess([{...base,...patch}],['001'],'2026-11-05')[0].ready,false)});
