import sharp from 'sharp';
import { env } from '@/lib/aws-runtime';
import { getChatGPTUser } from '../../chatgpt-auth';
export async function POST(req:Request){if(!await getChatGPTUser())return Response.json({error:'Sign in required'},{status:401});if(req.headers.get('origin')&&new URL(process.env.APP_URL || req.url).origin!==req.headers.get('origin'))return new Response('Forbidden',{status:403});const data=await req.formData();const f=data.get('file');if(!(f instanceof File)||f.size>5*1024*1024||f.size<8)return Response.json({error:'Choose a PNG or JPEG image up to 5 MB.'},{status:400});const bytes=new Uint8Array(await f.arrayBuffer());const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;if(!png&&!jpg)return Response.json({error:'Unsupported image format.'},{status:400});try{
 const image=sharp(bytes,{limitInputPixels:25_000_000,failOn:'error'});
 const metadata=await image.metadata();
 const rotated=[5,6,7,8].includes(metadata.orientation??1);
 const width=(rotated?metadata.height:metadata.width)??0;
 const height=(rotated?metadata.width:metadata.height)??0;
 if(!['png','jpeg'].includes(metadata.format??'')||width<350||height<450||width/height<0.65||width/height>0.85||(metadata.pages??1)>1)return Response.json({error:'Use a single portrait JPG or PNG, at least 350 × 450 pixels, with a passport-style crop.'},{status:400});
 await image.stats();
}catch{return Response.json({error:'The photo could not be decoded. Choose a valid JPG or PNG.'},{status:400});}
const key='portraits/'+crypto.randomUUID();await env.BUCKET!.put(key,bytes,{httpMetadata:{contentType:png?'image/png':'image/jpeg'}});return Response.json({key});}
export async function GET(req:Request){if(!await getChatGPTUser())return new Response('Unauthorized',{status:401});const key=new URL(req.url).searchParams.get('key')||'';if(!/^portraits\/[a-f0-9-]+$/.test(key))return new Response('Not found',{status:404});const o=await env.BUCKET!.get(key);if(!o)return new Response('Not found',{status:404});return new Response(o.body,{headers:{'Content-Type':o.httpMetadata?.contentType||'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
