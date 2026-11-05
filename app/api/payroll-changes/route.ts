import {getChatGPTUser} from '../../chatgpt-auth';
import {config} from '../../server-registry';
import {env} from '@/lib/aws-runtime';

export async function GET(req:Request){
 const user=await getChatGPTUser();
 if(!user)return new Response('Unauthorized',{status:401});
 const headers={'Cache-Control':'private, no-store'};
 const current=await config();
 const previous=current.source?.previousDataset;
 if(!previous)return Response.json({available:false,changes:[],next:null},{headers});
 if(env.DB.dialect!=='postgres')return Response.json({error:'Payroll comparison requires PostgreSQL.'},{status:503,headers});
 const cursor=new URL(req.url).searchParams.get('after')??'';
 const query=`WITH prior AS (
  SELECT number,agency,dataset,payload::jsonb AS record,
   CASE WHEN status='Not provided' AND NOT COALESCE((payload::jsonb->>'statusReviewed')::boolean,false) THEN 'Active' ELSE status END AS status
  FROM employees WHERE dataset=? AND number>?
 ), fresh AS (
  SELECT number,agency,dataset,payload::jsonb AS record,
   CASE WHEN status='Not provided' AND NOT COALESCE((payload::jsonb->>'statusReviewed')::boolean,false) THEN 'Active' ELSE status END AS status
  FROM employees WHERE dataset=? AND number>?
 )
 SELECT p.number,COALESCE(po.payload::jsonb->>'name',p.agency) AS previous_agency,COALESCE(fo.payload::jsonb->>'name',f.agency) AS current_agency,
  p.record->>'position' AS previous_position,f.record->>'position' AS current_position,
  p.status AS previous_status,f.status AS current_status
 FROM prior p LEFT JOIN fresh f ON p.number=f.number
 LEFT JOIN organisations po ON po.dataset=p.dataset AND po.key=p.agency
 LEFT JOIN organisations fo ON fo.dataset=f.dataset AND fo.key=f.agency
 WHERE f.number IS NULL
  OR (po.payload::jsonb->>'code',po.payload::jsonb->>'name') IS DISTINCT FROM (fo.payload::jsonb->>'code',fo.payload::jsonb->>'name')
  OR p.record->>'position' IS DISTINCT FROM f.record->>'position'
  OR p.status IS DISTINCT FROM f.status
 ORDER BY p.number LIMIT 51`;
 const {results}=await env.DB.prepare(query).bind(previous,cursor,current.dataset,cursor).all<{number:string}>();
 return Response.json({available:true,revision:current.revision,changes:results.slice(0,50),next:results.length>50?results[49].number:null},{headers});
}
