import {getChatGPTUser} from '../../chatgpt-auth';
import {env} from '@/lib/aws-runtime';
export async function GET(){
 if(!await getChatGPTUser())return new Response('Unauthorized',{status:401});
 const configured={database:!!(process.env.DB_CLUSTER_ARN&&process.env.DB_SECRET_ARN),photos:!!process.env.S3_BUCKET,login:!!(process.env.COGNITO_ISSUER&&process.env.COGNITO_CLIENT_ID&&process.env.COGNITO_DOMAIN&&process.env.APP_URL)};
 let database='not configured';if(configured.database){try{await env.DB.prepare('SELECT revision FROM registry WHERE id=?').bind('excel-config').first();database='connected';}catch{database='unavailable';}}
 return Response.json({configured,database,storage:'Private S3; verify with a synthetic photo upload.',sharedAcrossDevices:true},{headers:{'Cache-Control':'private,no-store'}});
}
