import {cookies} from 'next/headers';
export async function GET(){(await cookies()).delete('__Host-registry-session');const url=new URL('/logout',process.env.COGNITO_DOMAIN!);url.search=new URLSearchParams({client_id:process.env.COGNITO_CLIENT_ID!,logout_uri:process.env.APP_URL!+'/login'}).toString();return Response.redirect(url);}
