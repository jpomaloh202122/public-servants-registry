// Compatibility export names retained for the existing UI. Identity is Cognito.
import 'server-only';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {verifyRegistryToken,type RegistryUser} from '@/lib/identity';
export type ChatGPTUser=RegistryUser;
export async function getChatGPTUser():Promise<ChatGPTUser|null>{
 const token=(await cookies()).get('__Host-registry-session')?.value;
 const issuer=process.env.COGNITO_ISSUER,clientId=process.env.COGNITO_CLIENT_ID;
 if(!token||!issuer||!clientId)return null;
 try{return await verifyRegistryToken(token,{issuer,clientId});}catch{return null;}
}
export function chatGPTSignInPath(_returnTo='/'){return '/auth/login';}
export function chatGPTSignOutPath(_returnTo='/login'){return '/auth/logout';}
export async function requireChatGPTUser(returnTo:string){const user=await getChatGPTUser();if(!user)redirect(chatGPTSignInPath(returnTo));return user;}
