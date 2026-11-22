import sharp from 'sharp';
import {env} from '@/lib/aws-runtime';
export async function storePortrait(data:FormData){const employeeNumber=data.get('employeeNumber');
if(typeof employeeNumber!=='string'||!employeeNumber.trim()||employeeNumber.trim().length>100||/[\u0000-\u001f\u007f]/.test(employeeNumber))return Response.json({error:'Provide the Employee Number before uploading a photograph.'},{status:400});
const filename=encodeURIComponent(employeeNumber.trim()).replace(/[!'()*.]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
const f=data.get('file');if(!(f instanceof File)||f.size>5*1024*1024||f.size<8)return Response.json({error:'Choose a PNG or JPEG image up to 5 MB.'},{status:400});const bytes=new Uint8Array(await f.arrayBuffer());const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;if(!png&&!jpg)return Response.json({error:'Unsupported image format.'},{status:400});try{
 const image=sharp(bytes,{limitInputPixels:25_000_000,failOn:'error'});
 const metadata=await image.metadata();
 const rotated=[5,6,7,8].includes(metadata.orientation??1);
 const width=(rotated?metadata.height:metadata.width)??0;
 const height=(rotated?metadata.width:metadata.height)??0;
 if(!['png','jpeg'].includes(metadata.format??'')||width<350||height<450||width/height<0.65||width/height>0.85||(metadata.pages??1)>1)return Response.json({error:'Use a single portrait JPG or PNG, at least 350 × 450 pixels, with a passport-style crop.'},{status:400});
 await image.stats();
}catch{return Response.json({error:'The photo could not be decoded. Choose a valid JPG or PNG.'},{status:400});}
// Keep each upload immutable so a failed or conflicting record save leaves the saved photo intact.
const key='portraits/'+crypto.randomUUID()+'/'+filename+(png?'.png':'.jpg');await env.BUCKET!.put(key,bytes,{httpMetadata:{contentType:png?'image/png':'image/jpeg'}});return Response.json({key});}
