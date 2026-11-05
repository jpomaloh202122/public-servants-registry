import {cookies} from 'next/headers';
export async function GET(req:Request){
 (await cookies()).delete('__Host-registry-session');
 if(!process.env.COGNITO_DOMAIN||!process.env.COGNITO_CLIENT_ID||!process.env.APP_URL)return Response.redirect(new URL('/login',req.url));
 const url=new URL('/logout',process.env.COGNITO_DOMAIN);url.search=new URLSearchParams({client_id:process.env.COGNITO_CLIENT_ID,logout_uri:process.env.APP_URL+'/login'}).toString();return Response.redirect(url);
}
