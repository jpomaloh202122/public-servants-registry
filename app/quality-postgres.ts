export function postgresAssessmentCTE(source:any,asOf:string){
 const json=(key:string)=>`COALESCE(payload::jsonb->>'${key}','')`;
 const truth=(key:string)=>`COALESCE((payload::jsonb->>'${key}')::boolean,false)`;
 const status=source?`CASE WHEN status='Not provided' AND NOT ${truth('statusReviewed')} THEN 'Active' ELSE status END`:'status';
 return `WITH base AS (SELECT number,agency,search,payload,${status} AS status,${json('dob')} AS dob,${json('photo')} AS photo,${truth('verified')} AS verified FROM employees WHERE dataset=?),
 dated AS MATERIALIZED (SELECT *,registry_valid_dob(dob) AS valid_date FROM base),
 flags AS (SELECT *,CASE WHEN valid_date AND dob<='${asOf}' THEN CAST(substr('${asOf}',1,4) AS INTEGER)-CAST(substr(dob,1,4) AS INTEGER)-CASE WHEN substr('${asOf}',6)<substr(dob,6) THEN 1 ELSE 0 END ELSE NULL END AS age,
 (photo='')::int AS missing_photo,(photo<>'' AND NOT verified)::int AS photo_pending,(photo<>'' AND verified)::int AS photo_verified,(photo='' OR NOT verified)::int AS unverified,(dob='')::int AS missing_dob,(dob<>'' AND NOT valid_date)::int AS invalid_dob,(valid_date AND dob>'${asOf}')::int AS future_dob,${truth('sourceConflict')}::int AS conflicts,
 (trim(${json('first')})='' OR trim(${json('last')})='' OR trim(number)='' OR upper(trim(${json('gender')})) IN ('','N','U') OR dob='' OR trim(${json('position')})='' OR trim(agency)='' OR status='Not provided')::int AS missing_fields FROM dated),
 aged AS (SELECT *,COALESCE((age<18)::int,0) AS under18,COALESCE((age>65)::int,0) AS over65 FROM flags),
 checked AS (SELECT *,((missing_dob+invalid_dob+future_dob+under18+over65)>0)::int AS age_issues,
 CASE WHEN status='Active' AND missing_fields=0 AND unverified=0 AND conflicts=0 AND valid_date AND age BETWEEN 18 AND 65 THEN 1 ELSE 0 END AS ready FROM aged),
 assessed AS (SELECT *,1-ready AS incomplete FROM checked) `;
}
