import {env} from '@/lib/aws-runtime';
import type {RegistryUser} from '@/lib/identity';

export type Role = {id:string;name:string;mode:'view'|'correct'};
export const builtins:Role[]=[
 {id:'hr-officer',name:'Agency HR Officer',mode:'correct'},
 {id:'hr-manager',name:'Agency HR Manager',mode:'view'}
];
export type Assignment={role:string;agency:string};
export type AccessUser=RegistryUser & {access:'registry'|'admin'|'hr';agency?:string;role?:Role};
export async function setting<T>(id:string){
 const row=await env.DB.prepare('SELECT payload FROM registry WHERE id=?').bind(id).first<{payload:string}>();
 return row?JSON.parse(row.payload) as T:null;
}
export async function roles():Promise<Role[]>{
 const {results}=await env.DB.prepare("SELECT payload FROM registry WHERE id LIKE 'hr-role:%' ORDER BY id").all<{payload:string}>();
 return [...builtins,...results.map(r=>JSON.parse(r.payload) as Role)];
}
export async function resolveAccess(user:RegistryUser):Promise<AccessUser|null>{
 if(process.env.REGISTRY_MAIN_ADMIN_SUB===user.userId)return {...user,access:'admin',canManageSources:true,canComparePhotos:true};
 const assignment=await setting<Assignment>('hr-user:'+user.userId);
 if(!assignment)return user.registryMember?{...user,access:'registry'}:null;
 if(!assignment.agency)return null;
 const role=(await roles()).find(r=>r.id===assignment.role);
 return role?{...user,access:'hr',role,agency:assignment.agency,canComparePhotos:false,canManageSources:false}:null;
}
export function audit(actor:string,action:string,detail:string){
 const id=crypto.randomUUID(),time=new Date().toISOString();
 return env.DB.prepare('INSERT INTO audit_events(id,created_at,actor,payload) VALUES (?,?,?,?)')
  .bind(id,time,actor,JSON.stringify({id,time,actor,action,detail}));
}
