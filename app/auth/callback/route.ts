import {cookies} from 'next/headers';
import {createRemoteJWKSet,jwtVerify} from 'jose';
export async function GET(req:Request){
 const jar=await cookies(),u=new URL(req.url);let flow:any;
 try{flow=JSON.parse(jar.get('__Host-registry-oauth')?.value||'null');}catch{}
 jar.delete('__Host-registry-oauth');
 if(!flow||!u.searchParams.get('state')||flow.state!==u.searchParams.get('state')||!u.searchParams.get('code'))return new Response('Invalid sign-in request',{status:400});
 const base=process.env.APP_URL!,issuer=process.env.COGNITO_ISSUER!,client=process.env.COGNITO_CLIENT_ID!;
 const response=await fetch(new URL('/oauth2/token',process.env.COGNITO_DOMAIN!),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client,code:u.searchParams.get('code')!,redirect_uri:base+'/auth/callback',code_verifier:flow.verifier})});
 if(!response.ok)return new Response('Sign-in failed. Start again.',{status:401});
 try{const tokens=await response.json();const {payload:p}=await jwtVerify(tokens.id_token,createRemoteJWKSet(new URL(issuer+'/.well-known/jwks.json')),{issuer,audience:client});
 if(p.token_use!=='id'||p.email_verified!==true||!Array.isArray(p['cognito:groups'])||!p['cognito:groups'].includes('RegistryUsers'))return new Response('Ask the administrator to approve your registry access.',{status:403});
 jar.set('__Host-registry-session',tokens.id_token,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:Math.max(0,Math.min(3600,(p.exp||0)-Math.floor(Date.now()/1000)))});
 return Response.redirect(base+'/');}catch{return new Response('Invalid identity token',{status:401});}
}
