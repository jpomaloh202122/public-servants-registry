import {postgresAssessmentCTE} from './quality-postgres';
import type {Employee} from './model';
export const qualityOptions=[['all','All records'],['unverified','Not yet verified'],['missing_photo','Missing photograph'],['photo_pending','Photo awaiting verification'],['photo_verified','Photo verified'],['missing_fields','Missing required fields'],['missing_dob','Missing DOB'],['invalid_dob','Invalid DOB'],['future_dob','Future DOB'],['under18','Age below 18'],['over65','Age above 65'],['age_issues','Any DOB or age issue'],['conflicts','Conflicting source rows'],['ready','Ready for pass review'],['incomplete','Not ready for pass review']] as const;
export type QualityKey=typeof qualityOptions[number][0];
export function pngToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Pacific/Port_Moresby',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function dobInfo(dob:string,asOf=pngToday()){
 if(!dob)return {kind:'missing',age:null};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(dob)||!Number.isFinite(Date.parse(dob))||new Date(dob).toISOString().slice(0,10)!==dob)return {kind:'invalid',age:null};
 if(dob>asOf)return {kind:'future',age:null};
 const age=Number(asOf.slice(0,4))-Number(dob.slice(0,4))-(asOf.slice(5)<dob.slice(5)?1:0);
 return {kind:age<18?'under18':age>65?'over65':'valid',age};
}
export function dobIssue(e:Employee,asOf=pngToday()){const d=dobInfo(e.dob,asOf);return d.kind==='invalid'?'Invalid date of birth':d.kind==='future'?'Future date of birth':d.kind==='under18'?'Age below 18':d.kind==='over65'?'Age above 65':null;}
export function verificationLabel(e:Employee){return !e.photo?'Not verified · no photo':!e.verified?'Photo awaiting verification':'Photo verified';}
export function effectiveEmployee(e:Employee,source:unknown):Employee{return source&&e.status==='Not provided'&&!e.statusReviewed?{...e,sourceStatus:e.sourceStatus??e.status,status:'Active'}:e;}
// SQL and browser checks share the same age rule: completed birthdays, inclusive 18–65.
export function assessmentCTE(source:unknown,asOf=pngToday(),dialect:'sqlite'|'postgres'='sqlite',search=false,verifiedOnly=false){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf))throw Error('Invalid assessment date');
 if(dialect==='postgres')return postgresAssessmentCTE(source,asOf,search?employeeSearchPredicate:undefined,verifiedOnly);
 const status=source?"CASE WHEN status='Not provided' AND COALESCE(json_extract(payload,'$.statusReviewed'),0)=0 THEN 'Active' ELSE status END":'status';
 return `WITH base AS (SELECT number,agency,search,payload,${status} AS status,COALESCE(json_extract(payload,'$.dob'),'') AS dob,COALESCE(json_extract(payload,'$.photo'),'') AS photo,COALESCE(json_extract(payload,'$.verified'),0) AS verified FROM employees WHERE dataset=?${search?` AND ${employeeSearchPredicate}`:''}), dated AS (SELECT *,CASE WHEN length(dob)=10 AND dob GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND COALESCE(date(dob,'+0 days')=dob,0) THEN 1 ELSE 0 END AS valid_date FROM base), flags AS (SELECT *,CASE WHEN valid_date=1 AND dob<='${asOf}' THEN CAST(substr('${asOf}',1,4) AS INTEGER)-CAST(substr(dob,1,4) AS INTEGER)-(substr('${asOf}',6)<substr(dob,6)) ELSE NULL END AS age,(photo='') AS missing_photo,(photo<>'' AND verified=0) AS photo_pending,(photo<>'' AND verified<>0) AS photo_verified,(photo='' OR verified=0) AS unverified,(dob='') AS missing_dob,(dob<>'' AND valid_date=0) AS invalid_dob,(valid_date=1 AND dob>'${asOf}') AS future_dob,COALESCE(json_extract(payload,'$.sourceConflict'),0) AS conflicts,(trim(COALESCE(json_extract(payload,'$.first'),''))='' OR trim(COALESCE(json_extract(payload,'$.last'),''))='' OR trim(number)='' OR upper(trim(COALESCE(json_extract(payload,'$.gender'),''))) IN ('','N','U') OR dob='' OR trim(COALESCE(json_extract(payload,'$.position'),''))='' OR trim(agency)='' OR status='Not provided') AS missing_fields FROM dated), aged AS (SELECT *,COALESCE(age<18,0) AS under18,COALESCE(age>65,0) AS over65 FROM flags), checked AS (SELECT *,(missing_dob OR invalid_dob OR future_dob OR under18 OR over65) AS age_issues,(CASE WHEN status='Active' AND NOT missing_fields AND NOT unverified AND NOT conflicts AND valid_date=1 AND age BETWEEN 18 AND 65 THEN 1 ELSE 0 END) AS ready FROM aged), assessed AS (SELECT *,NOT ready AS incomplete FROM checked) `;
}
export const employeeSearchPredicate = "search LIKE ? ESCAPE '!'";
export function employeeSearchPattern(url: URL) {
 const query = url.searchParams.get('query')?.trim().toLowerCase();
 return query ? '%' + query.replace(/[!%_]/g, '!$&') + '%' : null;
}
export function qualityWhere(u:URL){let where='1=1';const args:string[]=[];for(const [param,col]of [['agency','agency'],['status','status']]){const v=u.searchParams.get(param);if(v&&v!=='all'){where+=` AND ${col}=?`;args.push(v);}}const q=employeeSearchPattern(u);if(q){where+=` AND ${employeeSearchPredicate}`;args.push(q);}const r=u.searchParams.get('readiness');if(r&&r!=='all'&&qualityOptions.some(([key])=>key===r))where+=` AND ${r}=1`;if(u.searchParams.get('exceptions')==='1')where+=' AND incomplete=1';return {where,args};}
export const flagKeys=qualityOptions.map(([k])=>k).filter(k=>k!=='all');
export const aggregateColumns='COUNT(*) AS count,'+flagKeys.map(k=>`SUM(${k}) AS ${k}`).join(',');
