import {createHash,randomBytes,randomUUID} from 'node:crypto';
import QRCode from 'qrcode';
import {env} from '@/lib/aws-runtime';
import {config,CONFIG} from './server-registry';
import {effectiveEmployee,pngToday} from './quality';
import {ready,issues,normaliseGender,type Employee,type Agency} from './model';
import type {IdCard,CardVerification} from './id-card';

export class CardProblem extends Error {
 constructor(message:string,readonly status:number,readonly checks:string[]=[]){super(message);}
}
export function validEmployeeNumber(value:unknown):value is string {
 return typeof value==='string'&&!!value&&value===value.trim()&&value.length<=100&&!/[\u0000-\u001f\u007f]/.test(value);
}
function verificationUrl(token:string) {
 const origin=process.env.APP_URL;
 if(!origin)throw new CardProblem('The registry origin is not configured.',503);
 const url=new URL(origin);
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)
  throw new CardProblem('The registry HTTPS origin is not configured correctly.',503);
 return new URL('/verify/'+token,url.origin).href;
}
async function qr(url:string) {
 return QRCode.toDataURL(url,{errorCorrectionLevel:'M',margin:4,width:360,color:{dark:'#172022',light:'#ffffff'}});
}
export async function cardSetupAvailable() {
 if(env.DB.dialect!=='postgres')return false;
 const result=await env.DB.prepare("SELECT to_regclass('public.registry_id_cards') IS NOT NULL AS installed").first<{installed:boolean}>();
 return result?.installed===true;
}
function hash(value:string){return createHash('sha256').update(value).digest('hex');}
function identityHash(employee:Employee,agency:Agency) {
 return hash(JSON.stringify({number:employee.number,first:employee.first,last:employee.last,
  gender:normaliseGender(employee.gender),dob:employee.dob,agency:agency.name,code:agency.code,
  position:employee.position,photo:employee.photo,verified:employee.verified}));
}
async function employeeSequence(number:string) {
 const row=await env.DB.prepare("SELECT COALESCE(MAX(seq),0)::text AS seq FROM registry_change_events WHERE employee_number=?")
  .bind(number).first<{seq:string}>();
 return String(row?.seq??'0');
}
export async function loadReadyCard(number:string) {
 const current=await config();
 if(!current.dataset)throw new CardProblem('No active payroll dataset.',409);
 const row=await env.DB.prepare('SELECT payload FROM employees WHERE dataset=? AND number=?')
  .bind(current.dataset,number).first<{payload:string}>();
 if(!row)throw new CardProblem('Employee not found in the current registry.',404);
 const employee=effectiveEmployee(JSON.parse(row.payload) as Employee,current.source);
 if(employee.number!==number)throw new CardProblem('Review the inconsistent Employee Number.',409,['Employee Number mismatch']);
 const checks=issues(employee);
 if(employee.status!=='Active')checks.unshift('Payroll status is '+employee.status);
 if(employee.payrollAbsent)checks.unshift('Employee is absent from the current payroll period');
 const organisation=await env.DB.prepare('SELECT payload FROM organisations WHERE dataset=? AND key=?')
  .bind(current.dataset,employee.agency).first<{payload:string}>();
 const agency=organisation?JSON.parse(organisation.payload) as Agency:null;
 if(!agency?.name?.trim()||!agency.code?.trim())checks.push('Agency or department reference is incomplete');
 if(!employee.photo?.startsWith('portraits/'))checks.push('A registry portrait is required');
 if(checks.length||!ready(employee)||employee.payrollAbsent)
  throw new CardProblem('Complete these checks before previewing or issuing this ID.',409,[...new Set(checks)]);
 if(!await env.BUCKET.head(employee.photo))throw new CardProblem('The saved portrait could not be found.',409,['Upload the missing portrait and verify it']);
 const installed=await cardSetupAvailable();
 const sequence=installed?await employeeSequence(number):'0';
 const latest=await config();
 if(latest.dataset!==current.dataset||latest.revision!==current.revision)
  throw new CardProblem('The registry changed. Recheck the employee record.',409);
 const card:IdCard={employeeNumber:employee.number,name:[employee.first,employee.last].join(' ').trim(),
  agency:agency!.name,agencyCode:agency!.code,position:employee.position,gender:normaliseGender(employee.gender),
  photoUrl:'/api/photo?key='+encodeURIComponent(employee.photo),datasetId:current.dataset,revision:Number(current.revision),
  payrollCycle:current.source?.asOf??null,assessedOn:pngToday(),preparedAt:new Date().toISOString(),status:'preview',
  issuanceAvailable:installed,verificationUrl:verificationUrl('preview'),qrDataUrl:''};
 return {card,current,recordHash:identityHash(employee,agency!),sequence};
}
type StoredCard={id:string;state:string;verification_token:string;record_hash:string;employee_sequence:string;issued_at:string;payload:string};
async function currentIssued(number:string) {
 return env.DB.prepare("SELECT * FROM registry_id_cards WHERE employee_number=? AND state='issued'")
  .bind(number).first<StoredCard>();
}
async function attachIssued(card:IdCard,stored:StoredCard) {
 const url=verificationUrl(stored.verification_token);
 return {...card,status:'issued' as const,cardId:stored.id,issuedAt:stored.issued_at,verificationUrl:url,qrDataUrl:await qr(url)};
}
export async function getIdCard(number:string) {
 const context=await loadReadyCard(number);
 if(context.card.issuanceAvailable) {
  const stored=await currentIssued(number);
  if(stored&&stored.record_hash===context.recordHash&&stored.employee_sequence===context.sequence)
   return attachIssued(context.card,stored);
  context.card.needsReplacement=!!stored;
 }
 context.card.qrDataUrl=await qr(context.card.verificationUrl);
 return context.card;
}
export async function issueIdCard(input:{employeeNumber:string;revision:number;datasetId:string},user:{userId:string;displayName:string}) {
 const context=await loadReadyCard(input.employeeNumber);
 if(!context.card.issuanceAvailable)throw new CardProblem('Install the issued-card database setup before issuing IDs.',503);
 const existing=await currentIssued(input.employeeNumber);
 if(existing&&existing.record_hash===context.recordHash&&existing.employee_sequence===context.sequence)
  return attachIssued(context.card,existing); // A repeated request reuses the committed card.
 if(context.card.datasetId!==input.datasetId||context.card.revision!==input.revision)
  throw new CardProblem('The registry changed. Review the saved record before issuing.',409);
 const token=randomBytes(32).toString('hex');
 const url=verificationUrl(token);
 const card:IdCard={...context.card,status:'issued',cardId:randomUUID(),issuedAt:new Date().toISOString(),
  verificationUrl:url,qrDataUrl:await qr(url)};
 const event={id:randomUUID(),time:card.issuedAt,action:'Public Servant ID issued',
  detail:input.employeeNumber+' issued registry ID '+card.cardId,actor:user.displayName};
 const {revision,...configuration}=context.current;
 const payload={...configuration,events:[event,...(configuration.events||[])].slice(0,100)};
 // The revision lock pins approval to the reviewed record and serialises replacement issuance.
 await env.DB.batch([
  env.DB.prepare('UPDATE registry SET payload=?,revision=revision+1 WHERE id=? AND revision=?')
   .bind(JSON.stringify(payload),CONFIG,input.revision).expectChanges(1),
  env.DB.prepare("UPDATE registry_id_cards SET state='superseded' WHERE employee_number=? AND state='issued'").bind(input.employeeNumber),
  env.DB.prepare('INSERT INTO registry_id_cards(id,employee_number,state,verification_token,token_hash,record_hash,employee_sequence,issued_at,issued_by,payload) VALUES (?,?,?,?,?,?,?,CAST(? AS timestamptz),?,?)')
   .bind(card.cardId,input.employeeNumber,'issued',token,hash(token),context.recordHash,context.sequence,
    card.issuedAt,user.userId,JSON.stringify({...card,qrDataUrl:''})),
  env.DB.prepare('INSERT INTO audit_events(id,created_at,actor,payload) VALUES (?,?,?,?)')
   .bind(event.id,event.time,user.userId,JSON.stringify({...event,dataset:context.card.datasetId,cardId:card.cardId}))
 ]);
 return {...card,revision:input.revision+1};
}
export async function verifyIdCard(token:string):Promise<CardVerification> {
 const checkedAt=new Date().toISOString();
 if(token==='preview')return {status:'preview',checkedAt};
 if(!/^[a-f0-9]{64}$/.test(token))return {status:'unknown',checkedAt};
 if(!await cardSetupAvailable())return {status:'unavailable',checkedAt};
 const stored=await env.DB.prepare('SELECT * FROM registry_id_cards WHERE token_hash=?')
  .bind(hash(token)).first<StoredCard&{employee_number:string}>();
 if(!stored)return {status:'unknown',checkedAt};
 if(stored.state==='revoked'||stored.state==='superseded')return {status:stored.state,checkedAt};
 try {
  const context=await loadReadyCard(stored.employee_number);
  if(context.recordHash!==stored.record_hash||context.sequence!==stored.employee_sequence)
   return {status:'changed',checkedAt};
  const finalState=await env.DB.prepare('SELECT state FROM registry_id_cards WHERE id=?').bind(stored.id).first<{state:string}>();
  if(!finalState||finalState.state!=='issued')return {status:finalState?.state==='superseded'?'superseded':finalState?.state==='revoked'?'revoked':'unknown',checkedAt};
  return {status:'valid',checkedAt,employeeNumber:context.card.employeeNumber,name:context.card.name,
   agency:context.card.agency,position:context.card.position,gender:context.card.gender};
 } catch(error) {
  if(error instanceof CardProblem&&[404,409].includes(error.status))return {status:'inactive',checkedAt};
  throw error;
 }
}
