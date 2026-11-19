import {getChatGPTUser} from '../../chatgpt-auth';
import {CardProblem,getIdCard,issueIdCard,validEmployeeNumber} from '../../server-id-card';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
function failure(error:unknown) {
 if(error instanceof CardProblem)return Response.json({error:error.message,checks:error.checks},{status:error.status,headers});
 console.error('ID card request failed');
 return Response.json({error:'The card could not be prepared. Recheck the registry connection and retry.'},{status:503,headers});
}
export async function GET(request:Request) {
 if(!await getChatGPTUser())return Response.json({error:'Sign in to prepare a card.'},{status:401,headers});
 const number=new URL(request.url).searchParams.get('employeeNumber');
 if(!validEmployeeNumber(number))return Response.json({error:'Provide an exact Employee Number.'},{status:400,headers});
 try{return Response.json(await getIdCard(number),{headers});}catch(error){return failure(error);}
}
export async function POST(request:Request) {
 const user=await getChatGPTUser();
 if(!user)return Response.json({error:'Sign in to issue a card.'},{status:401,headers});
 if(request.headers.get('origin')&&request.headers.get('origin')!==process.env.APP_URL)
  return Response.json({error:'Use the configured registry URL.'},{status:403,headers});
 const input=await request.json().catch(()=>null);
 if(!input||!validEmployeeNumber(input.employeeNumber)||input.confirmIssue!==true||
    !Number.isInteger(input.revision)||typeof input.datasetId!=='string')
  return Response.json({error:'Review and explicitly approve this employee ID before issuing.'},{status:400,headers});
 try{return Response.json(await issueIdCard(input,user),{headers});}catch(error){return failure(error);}
}
