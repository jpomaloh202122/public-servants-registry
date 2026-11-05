import {cookies} from 'next/headers';
import {randomBytes,createHash} from 'node:crypto';
export async function GET(){
 const domain=process.env.COGNITO_DOMAIN,client=process.env.COGNITO_CLIENT_ID,base=process.env.APP_URL;
 if(!domain||!client||!base)return new Response('Administrator must configure Cognito before sign-in.',{status:503});
 const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url'),nonce=randomBytes(32).toString('base64url');const jar=await cookies();
 jar.set('__Host-registry-oauth',JSON.stringify({state,verifier,nonce}),{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:600});
 const url=new URL('/oauth2/authorize',domain);url.search=new URLSearchParams({client_id:client,response_type:'code',scope:'openid email profile',redirect_uri:base+'/auth/callback',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
 return Response.redirect(url);
}
