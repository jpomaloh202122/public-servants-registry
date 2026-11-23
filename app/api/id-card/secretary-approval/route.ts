import {env} from '@/lib/aws-runtime';
import {getChatGPTUser} from '../../../chatgpt-auth';
import {CardProblem,getIdCard,validEmployeeNumber} from '../../../server-id-card';

export async function GET(request:Request) {
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
 const reply=(status:number)=>new Response(null,{status,headers});
 if(!await getChatGPTUser())return reply(401);
 const params=new URL(request.url).searchParams;
 const number=params.get('employeeNumber');
 const id=params.get('id');
 if(!validEmployeeNumber(number)||!id)return reply(400);
 try {
  const card=await getIdCard(number);
  if(card.status!=='issued'||card.cardId!==id)return reply(404);
  const signature=await env.BUCKET.get('sources/registry-branding/secretary-signature.png');
  if(!signature?.body)return reply(204);
  return new Response(signature.body,{headers:{...headers,'Content-Type':'image/png'}});
 } catch(error) {
  if(error instanceof CardProblem&&error.status<500)return reply(404);
  return reply(503);
 }
}
