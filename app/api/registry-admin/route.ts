import {AdminCreateUserCommand,AdminDeleteUserCommand,AdminGetUserCommand,AdminUpdateUserAttributesCommand,CognitoIdentityProviderClient,ListUsersCommand} from '@aws-sdk/client-cognito-identity-provider';
import {env} from '@/lib/aws-runtime';
import {getRegistrySession} from '../../chatgpt-auth';
import {audit,builtins,roles,setting,type Assignment} from '../../registry-access';
import {config} from '../../server-registry';

const cognito=new CognitoIdentityProviderClient({region:process.env.REGISTRY_AWS_REGION||process.env.AWS_REGION});
function pool(){return process.env.COGNITO_ISSUER?.split('/').pop();}
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const save=(id:string,value:Assignment)=>env.DB.prepare(
  "INSERT INTO registry(id,revision,payload) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET revision=registry.revision+1,payload=excluded.payload"+
  (value.role==='disabled'?'':" WHERE registry.payload::jsonb->>'role' <> 'disabled'")
 ).bind(id,JSON.stringify(value)).expectChanges(1);
async function agencies(){
 const c=await config();
 const {results}=await env.DB.prepare('SELECT payload FROM organisations WHERE dataset=? ORDER BY key').bind(c.dataset).all<{payload:string}>();
 return results.map(r=>JSON.parse(r.payload) as {code:string;name:string}).map(({code,name})=>({code,name}));
}
export async function GET(req:Request){
 if((await getRegistrySession())?.access!=='admin')return reply({error:'Administrator access required.'},403);
 const p=new URL(req.url).searchParams;
 try{
  if(p.has('employee')){
   const {results}=await env.DB.prepare('SELECT id,state,issued_at::text AS issued FROM registry_id_cards WHERE employee_number=? ORDER BY issued_at DESC LIMIT 100').bind(p.get('employee')).all();
   return reply({cards:results});
  }
  const result=await cognito.send(new ListUsersCommand({UserPoolId:pool(),Limit:30,PaginationToken:p.get('cursor')||undefined}));
  const users=await Promise.all((result.Users||[]).map(async u=>{
   const attr=(name:string)=>u.Attributes?.find(a=>a.Name===name)?.Value||'';
   const id=attr('sub');
   return {id,name:attr('name'),email:attr('email'),assignment:await setting<Assignment>('hr-user:'+id),main:id===process.env.REGISTRY_MAIN_ADMIN_SUB};
  }));
  return reply({users,next:result.PaginationToken,roles:await roles(),agencies:await agencies()});
 }catch{return reply({error:'Administration data unavailable. Check database and Cognito configuration.'},503);}
}
export async function POST(req:Request){
 const actor=await getRegistrySession();if(actor?.access!=='admin')return reply({error:'Administrator access required.'},403);
 if(req.headers.get('origin')!==(process.env.APP_URL||new URL(req.url).origin))return reply({error:'Invalid origin.'},403);
 const b=await req.json().catch(()=>null);
 if(!b||typeof b.action!=='string')return reply({error:'Invalid action.'},400);
 const log=(detail:string)=>audit(actor.userId,b.action,detail);
 try{
  if(['suspend','resume','revoke','delete-card'].includes(b.action)){
   if(typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>500||typeof b.id!=='string')return reply({error:'Select an ID and enter a reason.'},400);
   const allowed:Record<string,string[]>={suspend:['issued'],resume:['suspended'],revoke:['issued','suspended'],'delete-card':['issued','suspended','revoked','superseded']};
   if(!allowed[b.action].includes(b.state))return reply({error:'Invalid transition.'},409);
   const target:Record<string,string>={suspend:'suspended',resume:'issued',revoke:'revoked'};
   const change=b.action==='delete-card'?env.DB.prepare('DELETE FROM registry_id_cards WHERE id=? AND state=?').bind(b.id,b.state):
    env.DB.prepare('UPDATE registry_id_cards SET state=? WHERE id=? AND state=?').bind(target[b.action],b.id,b.state);
   await env.DB.batch([change.expectChanges(1),log(b.id+' / '+b.reason.trim())]);return reply({ok:true});
  }
  if(['create-role','update-role','delete-role'].includes(b.action)){
   const id=b.action==='create-role'?crypto.randomUUID():b.id;
   if(typeof id!=='string'||builtins.some(r=>r.id===id))return reply({error:'Built-in roles are protected.'},400);
   if(b.action==='delete-role'){
    const use=await env.DB.prepare("SELECT id FROM registry WHERE id LIKE 'hr-user:%' AND json_extract(payload,'$.role')=? LIMIT 1").bind(id).first();
    if(use)return reply({error:'Reassign users before deleting this role.'},409);
    await env.DB.batch([env.DB.prepare('DELETE FROM registry WHERE id=?').bind('hr-role:'+id).expectChanges(1),log(id)]);
   }else{
    if(!['view','correct'].includes(b.mode)||typeof b.name!=='string'||!b.name.trim()||b.name.length>100)return reply({error:'Enter a role name and access level.'},400);
    const role={id,name:b.name.trim(),mode:b.mode};
    const sql=b.action==='create-role'?'INSERT INTO registry(payload,id,revision) VALUES (?,?,1)':'UPDATE registry SET payload=?,revision=revision+1 WHERE id=?';
    await env.DB.batch([env.DB.prepare(sql).bind(JSON.stringify(role),'hr-role:'+id).expectChanges(1),log(JSON.stringify(role))]);
   }
   return reply({ok:true});
  }
  if(!['create-user','update-user','delete-user'].includes(b.action))return reply({error:'Unknown action.'},400);
  if(b.action!=='delete-user'&&(!(await roles()).some(r=>r.id===b.role)||(await agencies()).filter(a=>a.code===b.agency&&a.code).length!==1||typeof b.name!=='string'||!b.name.trim()||b.name.length>150))return reply({error:'Choose a role, a unique department code and a name.'},400);
  let sub:string|undefined,username:string|undefined;
  if(b.action==='create-user'){
   if(typeof b.email!=='string'||!/^\S+@\S+\.\S+$/.test(b.email))return reply({error:'Enter a valid email.'},400);
   const created=await cognito.send(new AdminCreateUserCommand({UserPoolId:pool(),Username:b.email.trim(),DesiredDeliveryMediums:['EMAIL'],UserAttributes:[{Name:'email',Value:b.email.trim()},{Name:'email_verified',Value:'true'},{Name:'name',Value:b.name.trim()}]}));
   sub=created.User?.Attributes?.find(a=>a.Name==='sub')?.Value;
  }else{
   if(typeof b.id!=='string'||!b.id||b.id===actor.userId)return reply({error:'Select another account.'},400);
   const account=await cognito.send(new AdminGetUserCommand({UserPoolId:pool(),Username:b.id}));
   sub=account.UserAttributes?.find(a=>a.Name==='sub')?.Value;username=account.Username;
   if(sub!==b.id||sub===actor.userId)return reply({error:'Account identity mismatch.'},409);
  }
  if(!sub)return reply({error:'Refresh the directory to finish assigning the account.'},409);
  const value=b.action==='delete-user'?{role:'disabled',agency:''}:{role:b.role,agency:b.agency};
  await env.DB.batch([save('hr-user:'+sub,value),log(sub+' / '+JSON.stringify(value))]);
  if(b.action==='delete-user')await cognito.send(new AdminDeleteUserCommand({UserPoolId:pool(),Username:username}));
  if(b.action==='update-user')await cognito.send(new AdminUpdateUserAttributesCommand({UserPoolId:pool(),Username:username,UserAttributes:[{Name:'name',Value:b.name.trim()}]}));
  return reply({ok:true});
 }catch(e){
  if(e instanceof Error&&e.name==='UsernameExistsException')return reply({error:'Account already exists. Select it in the directory to assign access.'},409);
  return reply({error:'Action could not be completed. Refresh the directory or card list and review the current state before retrying.'},409);
 }
}
