import type {Agency,Employee} from './model';
import {ready} from './model';
export type Engine='mysql'|'oracle';
const hex=(s:string)=>Array.from(new TextEncoder().encode(s),b=>b.toString(16).padStart(2,'0')).join('');
export function literal(v:unknown,d:Engine):string{
 if(v===null||v===undefined||v==='')return 'NULL';
 if(typeof v==='number'){if(!Number.isFinite(v))throw Error('Invalid number');return String(v);}
 const s=String(v);
 // Encoding data as hex prevents quotes, backslashes, newlines and SQL*Plus
 // substitution characters in source records from becoming executable SQL.
 return d==='mysql'?`CONVERT(X'${hex(s)}' USING utf8mb4)`:(s.match(/[\s\S]{1,200}/gu)||[]).map(chunk=>`UTL_I18N.RAW_TO_CHAR(HEXTORAW('${hex(chunk)}'),'AL32UTF8')`).join(' ||\n');
}
function clob(v:unknown,d:Engine){if(d==='mysql')return literal(v,d);if(v==null||v==='')return 'NULL';const chunks=String(v).match(/[\s\S]{1,200}/gu)||[];return chunks.map(s=>`TO_CLOB(${literal(s,d)})`).join(' ||\n');}
function insert(table:string,columns:string[],values:string[]){return `INSERT INTO ${table} (${columns.join(',')}) VALUES (${values.join(',\n')});\n`;}
export function schema(d:Engine){
 const txt=(n:number)=>d==='mysql'?`VARCHAR(${n})`:`VARCHAR2(${n} CHAR)`;
 const big=d==='mysql'?'LONGTEXT':'CLOB',num=d==='mysql'?'INTEGER':'NUMBER(10)',bool=d==='mysql'?'SMALLINT':'NUMBER(1)';
 const tail=d==='mysql'?' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin':'';
 return `CREATE TABLE sp_source (\n source_id ${txt(64)} PRIMARY KEY, source_filename ${txt(1000)}, source_rows ${num}, unique_employees ${num}, exported_employees ${num}, export_revision ${num}, export_scope ${big}, exported_utc TIMESTAMP, source_metadata ${big}\n)${tail};\nCREATE TABLE sp_organisation (\n organisation_id ${txt(128)} PRIMARY KEY, organisation_code ${txt(100)}, organisation_name ${txt(1000)}, organisation_type ${txt(100)}, source_id ${txt(64)} NOT NULL, CONSTRAINT sp_org_source_fk FOREIGN KEY (source_id) REFERENCES sp_source(source_id)\n)${tail};\nCREATE TABLE sp_employee (\n employee_id ${txt(128)} PRIMARY KEY, employee_number ${txt(100)} NOT NULL, first_name ${txt(1000)}, last_name ${txt(1000)}, sex_gender ${txt(100)}, date_of_birth DATE, position_title ${txt(1000)}, organisation_id ${txt(128)} NOT NULL, employment_status ${txt(100)}, photo_storage_key ${txt(1000)}, photo_verified ${bool} NOT NULL, source_conflict ${bool} NOT NULL, pass_ready ${bool} NOT NULL, source_row ${num}, source_unit ${big}, updated_utc TIMESTAMP, source_id ${txt(64)} NOT NULL, CONSTRAINT sp_employee_no_uq UNIQUE(employee_number), CONSTRAINT sp_emp_org_fk FOREIGN KEY (organisation_id) REFERENCES sp_organisation(organisation_id), CONSTRAINT sp_emp_source_fk FOREIGN KEY (source_id) REFERENCES sp_source(source_id), CONSTRAINT sp_photo_ck CHECK (photo_verified IN (0,1)), CONSTRAINT sp_conflict_ck CHECK (source_conflict IN (0,1)), CONSTRAINT sp_ready_ck CHECK (pass_ready IN (0,1))\n)${tail};\nCREATE INDEX sp_employee_org_ix ON sp_employee(organisation_id);\nCREATE INDEX sp_employee_status_ix ON sp_employee(employment_status);\nCREATE VIEW sp_pass_verification AS SELECT e.employee_number,e.first_name,e.last_name,e.position_title,o.organisation_code,o.organisation_name,e.employment_status FROM sp_employee e JOIN sp_organisation o ON o.organisation_id=e.organisation_id WHERE e.pass_ready=1;\n`;
}
function date(v:string){if(!v)return 'NULL';if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw Error('Invalid birth date');return `DATE '${v}'`;}
function timestamp(v:string){if(!v)return 'NULL';const t=new Date(v);if(!Number.isFinite(t.getTime()))throw Error('Invalid timestamp');return `TIMESTAMP '${t.toISOString().slice(0,19).replace('T',' ')}'`;}
export function sourceInsert(c:any,count:number,scope:string,now:string,d:Engine){return insert('sp_source',['source_id','source_filename','source_rows','unique_employees','exported_employees','export_revision','export_scope','exported_utc','source_metadata'],[literal(c.dataset,d),literal(c.source?.source,d),literal(c.source?.sourceRows,d),literal(c.source?.uniqueEmployees,d),String(count),String(c.revision),clob(scope,d),timestamp(now),clob(JSON.stringify(c.source),d)]);}
export function organisationInsert(a:Agency,dataset:string,d:Engine){return insert('sp_organisation',['organisation_id','organisation_code','organisation_name','organisation_type','source_id'],[a.id,a.code,a.name,a.type,dataset].map(x=>literal(x,d)));}
export function employeeInsert(e:Employee,dataset:string,d:Engine){return insert('sp_employee',['employee_id','employee_number','first_name','last_name','sex_gender','date_of_birth','position_title','organisation_id','employment_status','photo_storage_key','photo_verified','source_conflict','pass_ready','source_row','source_unit','updated_utc','source_id'],[literal(e.id,d),literal(e.number,d),literal(e.first,d),literal(e.last,d),literal(e.gender,d),date(e.dob),literal(e.position,d),literal(e.agency,d),literal(e.status,d),literal(e.photo,d),e.verified?'1':'0',e.sourceConflict?'1':'0',ready(e)?'1':'0',literal(e.sourceRow,d),clob(e.sourceUnit,d),timestamp(e.updated),literal(dataset,d)]);}
export function importGuide(){return `GOVERNMENT OF PAPUA NEW GUINEA | GOVERNMENT PAYROLL OFFICE
PUBLIC SERVANT REGISTRY — DATABASE EXPORT / IMPORT GUIDE

PURPOSE
SQL exports create a structured database from the current Excel-derived registry. They do not provision a database server, migrate the hosted platform, synchronise payroll, or issue SevisWallet credentials. MySQL means MySQL (not Microsoft SQL Server).

DOWNLOAD
Reports > Structured database export. Select MySQL or Oracle, all records or current report filters, and schema + data or schema only. Filters apply to employees; all organisation rows are included so foreign keys resolve. Schema-only exports contain no records. SQL downloads include an expected employee count and reconciliation queries.

TARGETS
MySQL 8.0+ with InnoDB and utf8mb4.
Oracle Database 12c+ (including 19c), an AL32UTF8 database, SQL*Plus or SQLcl, and access to UTL_I18N.RAW_TO_CHAR. Older Alesco Oracle versions need DBA validation; this export is not a payroll production migration.

IMPORT INTO A NEW EMPTY DATABASE / SCHEMA
Have a DBA create a dedicated restricted destination and an import account with table/view/index privileges. The SQL does not create users, passwords or grants and contains no DROP/TRUNCATE commands. Existing sp_* objects intentionally cause an error; do not use --force or ignore errors.
MySQL: mysql --default-character-set=utf8mb4 -u IMPORT_USER -p DESTINATION_DB < Registry_MySQL_...sql
Oracle: sqlplus IMPORT_USER@SERVICE, enter the password at the prompt, then @/path/Registry_Oracle_...sql
Oracle SQL Developer: use Run Script (F5), not Run Statement. SQL*Plus/SQLcl is the tested script format target. The Oracle script stops on SQL errors and rolls back uncommitted data. DDL is not transactional. MySQL batch mode must stop on errors. If an import fails, recreate the empty destination before retrying. No intermediate commits are emitted.

DATA MODEL
sp_source: source filename, original source/unique counts, exported employee count, registry revision, export filters, UTC timestamp, and source metadata JSON stored as text/CLOB.
sp_organisation: source organisation ID, code, name, type, source FK. Codes are not assumed unique: the workbook contains multiple source organisations sharing a prefix.
sp_employee: stable employee ID; unique text employee number (leading zeros preserved); names; sex/gender; DOB; position; organisation FK; status; photo reference/verification; source conflict flag; pass readiness; source row/unit; last update UTC; source FK.
sp_pass_verification: limited-field view of employees marked ready for review, excluding DOB, gender and photo references. The DBA should grant read-only access to this view where appropriate. It is not a credential issuer or a substitute for live status validation.

DATA QUALITY / SCOPE
Blank text exports as SQL NULL (Oracle treats empty text as NULL). DOB is a DATE; timestamps are UTC, without timezone. Unknown gender codes and Not provided employment status remain unchanged. Employees are exported once per unique number; conflicting duplicates are flagged. Original duplicate variants remain in the archived source workbook, not in sp_employee. Dates/names already normalised by the registry are exported as currently held. Salary, bank and payroll payment details are not included. Photos are references to private object storage, not image binaries: image migration requires a separate authorised transfer. Confirmed active totals cannot be inferred when status is absent.

CONSISTENCY AND RECONCILIATION
Avoid editing or importing source records during a download. The platform checks the registry revision between pages and aborts a download if it changes; retry any interrupted download. Only use a completed file ending with EXPORT COMPLETE. Compare sp_source.exported_employees to COUNT(*) from sp_employee; check for duplicate employee numbers and orphan organisations. The end-of-script SELECT queries help with reconciliation. A filtered export is a subset, not a complete registry backup. Source archive and activity history are not part of this relational extract.

SECURITY
Downloads contain personal information including DOB and sex/gender. Keep files in approved encrypted storage, restrict distribution, and use a least-privilege verification account. The platform continues to require sign-in. Destination hosting, network access, backup, retention, encryption and database permissions are the receiving team's responsibility.

VALIDATION
The SQL generators have automated tests for field mapping, dialect syntax patterns, key relationships, Unicode and SQL injection characters. No live MySQL or Oracle server is connected to this platform; execute a staging import and reconcile counts before operational use.

REFERENCES
https://dev.mysql.com/doc/refman/8.0/en/hexadecimal-literals.html
https://docs.oracle.com/en/database/oracle/oracle-database/19/arpls/UTL_I18N.html
`;
}
