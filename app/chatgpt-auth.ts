// Compatibility names retained for the existing UI; identity is verified by Cognito.
import 'server-only';
import {cookies} from 'next/headers';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {redirect} from 'next/navigation';
export type ChatGPTUser={userId:string;displayName:string;email:string;fullName:string|null};
let jwks:ReturnType<typeof createRemoteJWKSet>|undefined;
export async function getChatGPTUser():Promise<ChatGPTUser|null>{
 const token=(await cookies()).get('__Host-registry-session')?.value;
 if(!token)return null;
 const issuer=process.env.COGNITO_ISSUER,client=process.env.COGNITO_CLIENT_ID;if(!issuer||!client)return null;
 try{jwks??=createRemoteJWKSet(new URL(issuer+'/.well-known/jwks.json'));const {payload:p}=await jwtVerify(token,jwks,{issuer,audience:client});
 if(p.token_use!=='id'||p.email_verified!==true||!p.sub||typeof p.email!=='string')return null;
 const groups=Array.isArray(p['cognito:groups'])?p['cognito:groups']:[];if(!groups.includes('RegistryUsers'))return null;
 return {userId:p.sub,email:p.email,displayName:String(p.name||p.email),fullName:typeof p.name==='string'?p.name:null};
 }catch{return null;}
}
export function chatGPTSignInPath(_returnTo='/'){return '/auth/login';}
export function chatGPTSignOutPath(_returnTo='/login'){return '/auth/logout';}
export async function requireChatGPTUser(returnTo:string){const u=await getChatGPTUser();if(!u)redirect(chatGPTSignInPath(returnTo));return u;}
