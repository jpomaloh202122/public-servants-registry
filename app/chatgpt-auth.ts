// Compatibility export names retained for the existing UI. Identity is Cognito.
import 'server-only';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {verifyRegistryToken} from '@/lib/identity';
import {resolveAccess,type AccessUser} from './registry-access';
export type ChatGPTUser=AccessUser;
export async function getRegistrySession():Promise<ChatGPTUser|null>{
 const token=(await cookies()).get('__Host-registry-session')?.value;
 const issuer=process.env.COGNITO_ISSUER,clientId=process.env.COGNITO_CLIENT_ID;
 if(!token||!issuer||!clientId)return null;
 try{return await resolveAccess(await verifyRegistryToken(token,{issuer,clientId,allowManaged:true}));}catch{return null;}
}
// Whole-of-government routes only accept central registry staff.
export async function getChatGPTUser(){const user=await getRegistrySession();return user?.access==='hr'?null:user;}
export function chatGPTSignInPath(_returnTo='/'){return '/auth/login';}
export function chatGPTSignOutPath(_returnTo='/login'){return '/auth/logout';}
export async function requireChatGPTUser(returnTo:string){const user=await getChatGPTUser();if(!user)redirect(chatGPTSignInPath(returnTo));return user;}
