import {verifyIdCard} from '../../../server-id-card';
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'};
export async function GET(request:Request) {
 try {
  const result=await verifyIdCard(new URL(request.url).searchParams.get('token')??'');
  return Response.json(result,{status:result.status==='unavailable'?503:200,headers});
 } catch {
  return Response.json({status:'unavailable',checkedAt:new Date().toISOString()},{status:503,headers});
 }
}
