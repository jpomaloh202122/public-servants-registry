import assert from 'node:assert/strict';
import {csvRows,jsonRows,sqlRows,suggestMapping,normalise} from '../app/import-data';
import {schema,employeeInsert,organisationInsert} from '../app/database-sql';
const csv='EMPLOYEE,NAME_REPORT,CLEVEL,ADMIN_LOCATION,DOB,GENDER,OCCUP_POS_TITLE\r\n0001,"Smith, Jane",123456,Dept A - Unit,1990-01-02,Female,Officer\r\n0001,"Smith, Jane",123456,Dept A - Unit,1990-01-02,Female,Officer\r\n0001,"Smith, Janet",123456,Dept A - Unit,1990-01-02,Female,Officer\r\n';
const rows=csvRows(csv)[0].rows,r=normalise(rows,suggestMapping(rows),'iso');assert.equal(r.employees.length,1);assert.equal(r.employees[0].number,'0001');assert.equal(r.employees[0].first,'Jane');assert.equal(r.employees[0].last,'Smith');assert.equal(r.employees[0].status,'Not provided');assert.equal(r.agencies[0].code,'123');assert.equal(r.duplicates,2);assert.equal(r.conflicts,1);assert.equal(r.errors.length,0);
const dyn=jsonRows('{"Item":{"employee_number":{"S":"0002"},"first_name":{"S":"John"},"organisation_name":{"S":"Dept B"},"date_of_birth":{"S":"02/01/1990"}}}\n{"Item":{"employee_number":{"S":"0003"},"organisation_name":{"S":"Dept C"}}}')[0].rows;assert.equal(dyn[0].employee_number,'0002');assert.equal(normalise(dyn,suggestMapping(dyn),'dmy').employees[0].dob,'1990-01-02');assert.ok(normalise(dyn,suggestMapping(dyn),'iso').errors.length);
assert.equal(jsonRows('[{"employee":{"number":"1","name":"Jane"}}]')[0].rows[0]['employee.number'],'1');
assert.throws(()=>csvRows('a,a\n1,2'),/unique/);assert.throws(()=>csvRows('a,b\n"unclosed'),/quotation/);
for(const d of ['mysql','oracle'] as const){const employee={...r.employees[0],first:"O'Brien & Δ😀",sourceUnit:'Large long unit '.repeat(300)};const sql=schema(d)+organisationInsert(r.agencies[0],'a'.repeat(64),d)+employeeInsert(employee,'a'.repeat(64),d);const tables=sqlRows(sql);const t=tables.find(t=>t.name==='sp_employee')!;assert.equal(t.rows[0].first_name,employee.first);assert.equal(t.rows[0].source_unit,employee.sourceUnit);const result=normalise(t.rows,suggestMapping(t.rows),'iso');assert.equal(result.employees[0].number,'0001');assert.equal(result.agencies[0].name,r.agencies[0].name);assert.ok(result.employees[0].sourceConflict);}
const ms=sqlRows("INSERT INTO [dbo].[employee] ([Employee Number],[First Name],[Department]) VALUES (N'0004',N'O''Brien',N'Dept A'),('0005','Bob','Dept B');")[0];assert.equal(ms.rows.length,2);assert.equal(ms.rows[0]['First Name'],"O'Brien");
assert.equal(sqlRows("SET IDENTITY_INSERT dbo.employee ON\nGO\nINSERT [dbo].[employee] ([Employee Number],[Department]) VALUES ('0001','Dept A')\nGO\nINSERT [dbo].[employee] ([Employee Number],[Department]) VALUES ('0002','Dept A')\nGO\n")[0].rows.length,2);
assert.equal(sqlRows("INSERT INTO employee (dob) VALUES (TO_DATE('1990-01-02','YYYY-MM-DD'));")[0].rows[0].dob,'1990-01-02');
assert.throws(()=>sqlRows("INSERT INTO employee (number) VALUES (evil());"),/Unsupported SQL function/);
assert.throws(()=>sqlRows("INSERT INTO employee (number) SELECT number FROM another;"),/expected VALUES/);
assert.throws(()=>sqlRows("UPDATE employee SET first='X';"),/Only INSERT/);
console.log('Import parsers: CSV, mapping, duplicate conflicts, DynamoDB, nested JSON, date formats, MySQL/Oracle round-trip, SQL Server and rejected SQL expressions passed.');

const sparseGender=[
  {EMPLOYEE:'0005',CLEVEL:'123',NAME_REPORT:'Synthetic, First'},
  {EMPLOYEE:'0006',CLEVEL:'123',NAME_REPORT:'Synthetic, Second','Sex or Gender':' f '},
  {EMPLOYEE:'0007',CLEVEL:'123',NAME_REPORT:'Synthetic, Third','Sex or Gender':'M'},
  {EMPLOYEE:'0008',CLEVEL:'123',NAME_REPORT:'Synthetic, Fourth','Sex or Gender':'2'},
];
const genderMapping=suggestMapping(sparseGender);
assert.equal(genderMapping.gender,'Sex or Gender');
const genderImport=normalise(sparseGender,genderMapping,'iso');
assert.deepEqual(genderImport.employees.map(e=>e.gender),['','Female','Male','2']);
assert.equal(genderImport.missingGender,1);
