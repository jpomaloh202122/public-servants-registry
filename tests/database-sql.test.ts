import assert from 'node:assert/strict';
import {literal,schema,employeeInsert,sourceInsert,organisationInsert,importGuide} from '../app/database-sql';
const employee={id:'e1',number:'000123',first:"O'Brien\\\n& DROP TABLE sp_employee; --",last:'日本😀',gender:'U',dob:'1990-01-02',position:'Officer',agency:'org1',status:'Not provided',photo:'',verified:false,updated:'2026-11-03T11:22:33+10:00',sourceRow:2,sourceUnit:'Long unit '.repeat(1000),sourceConflict:true};
for(const d of ['mysql','oracle'] as const){
 const ddl=schema(d),sql=employeeInsert(employee,'a'.repeat(64),d);
 assert.match(ddl,/UNIQUE\(employee_number\)/);assert.match(ddl,/REFERENCES sp_organisation/);assert.match(ddl,/WHERE e.pass_ready=1/);assert.doesNotMatch(ddl,/DROP|TRUNCATE|FOREIGN_KEY_CHECKS/);
 assert.match(sql,/DATE '1990-01-02'/);assert.match(sql,/TIMESTAMP '2026-11-03 01:22:33'/);assert.ok(!sql.includes(employee.first));assert.ok(!sql.includes(employee.last));if(d==='oracle')assert.ok(Math.max(...sql.split('\n').map(x=>x.length))<2000);
 assert.ok(sql.includes(literal('000123',d)));assert.match(sql.replaceAll('\n',''),/,0,1,0,2,/);assert.equal(literal('',d),'NULL');assert.equal(literal(undefined,d),'NULL');
 assert.throws(()=>employeeInsert({...employee,dob:'2026-02-30'},'x',d));
 assert.match(sourceInsert({dataset:'a'.repeat(64),revision:4,source:{source:'test.xlsx',sourceRows:10,uniqueEmployees:9}},7,'filtered','2026-11-03T00:00:00Z',d),/INSERT INTO sp_source/);
 assert.match(organisationInsert({id:'org1',code:'001',name:'Example',type:'Organisation'},'x',d),/INSERT INTO sp_organisation/);
 const encoded=literal(employee.last,d).match(/(?:X'|HEXTORAW\(')([0-9a-f]+)'/)![1];assert.equal(Buffer.from(encoded,'hex').toString('utf8'),employee.last);
}
assert.match(importGuide(),/No live MySQL or Oracle server/);
console.log('Database SQL generators: 2 dialects; Unicode, escaping, dates, identifiers, FK and readiness checks passed.');
