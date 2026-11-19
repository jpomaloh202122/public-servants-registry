import {getChatGPTUser} from '../../chatgpt-auth';
import {issuedCards} from '../../server-issued-cards';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(request:Request) {
 if(!await getChatGPTUser())return Response.json({error:'Sign in to view issued IDs.'},{status:401,headers});
 try{return Response.json(await issuedCards(new URL(request.url)),{headers});}
 catch{return Response.json({error:'Issued IDs could not be loaded. Retry the connection.'},{status:503,headers});}
}
