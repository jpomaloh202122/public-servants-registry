// Read-only diagnostics. No npm dependencies; no passwords, dates of birth or photo contents are printed.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const region=process.env.AWS_REGION||'ap-southeast-2';
const directory=mkdtempSync(join(tmpdir(),'registry-card-check-'));
function aws(args){return JSON.parse(execFileSync('aws',[...args,'--region',region,'--output','json','--no-cli-pager'],{encoding:'utf8',stdio:['ignore','pipe','inherit']}));}
try {
 if(aws(['sts','get-caller-identity']).Account!=='440660366630')throw Error('Use the approved registry account.');
 const outputs=Object.fromEntries(aws(['cloudformation','describe-stacks','--stack-name','ps-id-registry-backend']).Stacks[0].Outputs.map(o=>[o.OutputKey,o.OutputValue]));
 const query=(sql,parameters=[])=>{
  const file=join(directory,'request.json');writeFileSync(file,JSON.stringify({resourceArn:outputs.DbClusterArn,secretArn:outputs.OwnerSecretArn,database:outputs.DbName,sql,parameters,formatRecordsAs:'JSON'}),{mode:0o600});
  return JSON.parse(aws(['rds-data','execute-statement','--cli-input-json','file://'+file]).formattedRecords||'[]');
 };
 const [{payload}]=query("SELECT payload FROM registry WHERE id='excel-config'");
 const configuration=JSON.parse(payload);
 if(!configuration.dataset)throw Error('No active dataset.');
 const names=process.argv.slice(2);if(!names.length)names.push('Jessy Sekere','Joshua Pomaloh');
 const [{installed}]=query("SELECT to_regclass('public.registry_id_cards') IS NOT NULL AS installed");
 for(const name of names){
  const rows=query(`SELECT e.number,e.status,e.payload,o.payload AS organisation FROM employees e LEFT JOIN organisations o ON o.dataset=e.dataset AND o.key=e.agency WHERE e.dataset=:dataset AND lower(regexp_replace(trim(concat(e.payload::jsonb->>'first',' ',e.payload::jsonb->>'last')),'\\s+',' ','g'))=:name LIMIT 3`,[
   {name:'dataset',value:{stringValue:configuration.dataset}},{name:'name',value:{stringValue:name.trim().replace(/\s+/g,' ').toLowerCase()}}]);
  if(rows.length!==1){console.log(JSON.stringify({name,result:rows.length?'Multiple matches; use Employee Number to distinguish':'Not found in the active dataset'}));continue;}
  const row=rows[0],e=JSON.parse(row.payload),org=row.organisation?JSON.parse(row.organisation):null;
  const checks=[];const status=configuration.source&&e.status==='Not provided'&&!e.statusReviewed?'Active':e.status;
  if(status!=='Active')checks.push('Payroll status is '+status);if(e.payrollAbsent)checks.push('Absent from current payroll');
  for(const [key,label]of [['first','First name'],['last','Last name'],['number','Employee Number'],['position','Position'],['agency','Department']])if(!e[key]?.trim())checks.push(label+' missing');
  if(!e.gender?.trim()||['N','U'].includes(e.gender.trim().toUpperCase()))checks.push('Sex / gender missing');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Pacific/Port_Moresby',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(!e.dob||!/^\d{4}-\d{2}-\d{2}$/.test(e.dob)||!Number.isFinite(Date.parse(e.dob))||new Date(e.dob).toISOString().slice(0,10)!==e.dob)checks.push('DOB missing or invalid');
  else {const age=+today.slice(0,4)-+e.dob.slice(0,4)-(today.slice(5)<e.dob.slice(5)?1:0);if(e.dob>today||age<18||age>65)checks.push('DOB or age requires review');}
  if(e.sourceConflict)checks.push('Conflicting source rows');
  if(!org?.name?.trim()||!org.code?.trim())checks.push('Agency reference incomplete');
  let photoReadable=false;
  if(!e.photo?.startsWith('portraits/'))checks.push('Registry portrait missing');
  else {try{execFileSync('aws',['s3api','head-object','--bucket',outputs.S3Bucket,'--key',e.photo,'--region',region],{stdio:'ignore'});photoReadable=true;}catch{checks.push('Portrait unavailable or S3 read permission missing');}}
  if(!e.verified)checks.push('Photo not verified');
  const issuance=installed?query("SELECT id,state,issued_at FROM registry_id_cards WHERE employee_number=:number ORDER BY issued_at DESC LIMIT 1",[{name:'number',value:{stringValue:row.number}}])[0]:null;
  console.log(JSON.stringify({name:[e.first,e.last].join(' '),employeeNumber:row.number,status,photoUploaded:!!e.photo,photoReadable,photoVerified:!!e.verified,readinessChecks:checks,ready:!checks.length,issuanceSetupInstalled:installed,latestIssuance:issuance||null},null,2));
 }
}finally{rmSync(directory,{recursive:true,force:true});}
