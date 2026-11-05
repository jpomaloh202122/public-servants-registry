import {getChatGPTUser} from '../../chatgpt-auth';
import {config} from '../../server-registry';
import {env} from '@/lib/aws-runtime';

export async function GET(){
  if(!await getChatGPTUser())return new Response('Unauthorized',{status:401});
  const [db,storage,identity]=await Promise.allSettled([
    (async()=>{
      const active=await config();
      const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM employees WHERE dataset=?').bind(active.dataset).first<{n:number}>();
      return {revision:active.revision,records:Number(count?.n??0),source:active.source?.source??null};
    })(),
    env.BUCKET.check(),
    (async()=>{
      if(!process.env.COGNITO_ISSUER)throw Error('Missing issuer');
      const response=await fetch(new URL('.well-known/jwks.json',process.env.COGNITO_ISSUER+'/'),{cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(!response.ok||!(await response.json()).keys?.length)throw Error('Keys unavailable');
    })()
  ]);
  const database=db.status==='fulfilled'?'connected':'unavailable';
  return Response.json({
    checkedAt:new Date().toISOString(),database,
    dataset:db.status==='fulfilled'?db.value:null,
    services:[
      {name:'Aurora PostgreSQL / Data API',status:database,detail:'Reads the active dataset revision and counts its stored employee rows.'},
      {name:'S3',status:storage.status==='fulfilled'?'reachable':'unavailable',detail:'Checks bucket access using the runtime role.'},
      {name:'Cognito',status:identity.status==='fulfilled'?'reachable':'unavailable',detail:'Checks the configured issuer’s signing-key endpoint.'},
      {name:'Registry access controls',status:'enforced by app',detail:'Requires a signed session, verified email and RegistryUsers membership.'},
      {name:'AWS security posture',status:'requires AWS review',detail:'Bucket public access settings, encryption, MFA policy and IAM drift are outside these runtime checks.'}
    ]
  },{headers:{'Cache-Control':'private, no-store'}});
}
