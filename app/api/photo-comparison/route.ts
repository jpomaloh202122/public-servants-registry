import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {CompareFacesCommand, DetectFacesCommand, RekognitionClient, type Image} from '@aws-sdk/client-rekognition';
import {env} from '@/lib/aws-runtime';
import {getChatGPTUser} from '../../chatgpt-auth';
import {CardProblem, getIdCard, validEmployeeNumber, verifyIdCard} from '../../server-id-card';

const region='ap-southeast-2';
const client=new RekognitionClient({region});
const maxBytes=3*1024*1024;
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const purposes=['ID presentation','Employee record check'];
class Problem extends Error {constructor(message:string,readonly status=400){super(message);}}
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});

// Limit memory even if the browser or a proxy omits Content-Length.
async function readBody(req:Request,limit:number){
 if(!req.body||Number(req.headers.get('content-length')||0)>limit)throw new Problem('Request exceeds the size limit.',413);
 const reader=req.body.getReader(),chunks:Uint8Array[]=[];
 let size=0;
 try{
  while(true){const {value,done}=await reader.read();if(done)break;
   size+=value.length;if(size>limit){await reader.cancel();throw new Problem('Request exceeds the size limit.',413);}chunks.push(value);}
 }finally{reader.releaseLock();}
 return Buffer.concat(chunks);
}

async function photo(bytes:Buffer){
 try{
  const image=sharp(bytes,{limitInputPixels:20_000_000,failOn:'error'});
  const meta=await image.metadata();
  if(!['jpeg','png'].includes(meta.format||'')||(meta.pages??1)!==1)throw Error();
  return await image.rotate().resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).jpeg().toBuffer();
 }catch{throw new Problem('Choose one readable JPEG or PNG portrait.');}
}

async function singleFace(image:Image){
 const result=await client.send(new DetectFacesCommand({Image:image,Attributes:['DEFAULT']}));
 return result.FaceDetails?.length===1;
}

async function resolveClaim(claim:string){
 if(!claim.includes('://')){
  if(!validEmployeeNumber(claim))throw new Problem('Enter an exact Employee Number or scan a registry QR link.');
  return {number:claim,token:null};
 }
 let url:URL;try{url=new URL(claim);}catch{throw new Problem('Invalid registry QR link.');}
 const token=url.pathname.match(/^\/verify\/([a-f0-9]{64})$/)?.[1];
 if(!token||url.origin!==new URL(process.env.APP_URL!).origin||url.username||url.password||url.search||url.hash)
  throw new Problem('Use a current QR link issued by this registry.');
 const result=await verifyIdCard(token);
 if(result.status!=='valid'||!result.employeeNumber)throw new Problem('Card could not be validated. Use manual review.',409);
 return {number:result.employeeNumber,token};
}

type Review={kind:'photoComparison';outcome:string;purpose:string;number:string;revision:number;dataset:string;cardId:string|null;viaCard:boolean};
async function confirm(req:Request,actor:string){
 let id:unknown;try{id=JSON.parse((await readBody(req,1024)).toString()).reviewId;}catch{throw new Problem('Invalid review request.');}
 if(typeof id!=='string'||!/^photo-[a-f0-9-]{36}$/.test(id))throw new Problem('Invalid review reference.');
 const row=await env.DB.prepare('SELECT payload FROM audit_events WHERE id=? AND actor=? AND created_at>=?')
  .bind(id,actor,new Date(Date.now()-300_000).toISOString()).first<{payload:string}>();
 if(!row)throw new Problem('Review expired. Start a fresh comparison.',409);
 const review=JSON.parse(row.payload) as Review;
 if(review.kind!=='photoComparison'||review.outcome!=='awaiting review')throw new Problem('This review is closed.',409);
 const card=await getIdCard(review.number);
 if(card.revision!==review.revision||card.datasetId!==review.dataset||(card.cardId??null)!==review.cardId||
    (review.viaCard&&card.status!=='issued'))throw new Problem('Registry or card changed. Start a fresh comparison.',409);
 const final={...review,outcome:'officer confirmed',confirmedAt:new Date().toISOString()};
 const saved=await env.DB.prepare('UPDATE audit_events SET payload=? WHERE id=? AND actor=? AND payload=?')
  .bind(JSON.stringify(final),id,actor,row.payload).run();
 if(saved.meta.changes!==1)throw new Problem('Review already completed.',409);
 return reply({person:{name:card.name,department:card.agency,position:card.position,employeeNumber:card.employeeNumber,
  cardStatus:card.status==='issued'?'Current issued ID':'No current issued ID'}});
}

export async function POST(req:Request){
 const user=await getChatGPTUser();
 if(!user)return reply({error:'Sign in required.'},401);
 if(!user.canComparePhotos||!process.env.APP_URL||req.headers.get('origin')!==new URL(process.env.APP_URL).origin)
  return reply({error:'Verifier access required.'},403);
 let auditId:string|undefined;
 try{
  if((process.env.REGISTRY_AWS_REGION||process.env.AWS_REGION)!==region||!process.env.S3_BUCKET)
   throw new Problem('The Sydney comparison service is unavailable.',503);
  if(req.headers.get('content-type')?.startsWith('application/json'))return await confirm(req,user.userId);
  const purpose=req.headers.get('x-check-purpose')||'';
  if(!purposes.includes(purpose)||req.headers.get('x-pilot-consent')!=='yes')throw new Problem('Confirm pilot participation and select a purpose.');
  const count=await env.DB.prepare("SELECT COUNT(*) AS total FROM audit_events WHERE actor=? AND created_at>=? AND id LIKE 'photo-%'")
   .bind(user.userId,new Date(Date.now()-60_000).toISOString()).first<{total:number}>();
  if(Number(count?.total)>=10)throw new Problem('Please wait a minute before another comparison.',429);
  const id='photo-'+randomUUID();
  await env.DB.prepare('INSERT INTO audit_events(id,created_at,actor,payload) VALUES (?,?,?,?)')
   .bind(id,new Date().toISOString(),user.userId,JSON.stringify({kind:'photoComparison',outcome:'started',purpose})).run();
  auditId=id;
  let claim:string;try{claim=decodeURIComponent(req.headers.get('x-registry-claim')||'');}catch{throw new Problem('Invalid claim.');}
  const {number,token}=await resolveClaim(claim);
  const card=await getIdCard(number);
  if(token&&(card.status!=='issued'||new URL(card.verificationUrl).pathname!=='/verify/'+token))throw new Problem('Card changed. Repeat the check.',409);
  const key=new URL(card.photoUrl,process.env.APP_URL).searchParams.get('key');
  if(!key?.startsWith('portraits/'))throw new Problem('Verified portrait unavailable.',409);
  const input:Image={Bytes:await photo(await readBody(req,maxBytes))};
  const reference:Image={S3Object:{Bucket:process.env.S3_BUCKET,Name:key}};
  let outcome='manual review';
  if(await singleFace(input)&&await singleFace(reference)){
   const result=await client.send(new CompareFacesCommand({SourceImage:input,TargetImage:reference,SimilarityThreshold:99,QualityFilter:'HIGH'}));
   if(result.FaceMatches?.length===1&&(result.FaceMatches[0].Similarity??0)>=99)outcome='awaiting review';
  }
  const review:Review={kind:'photoComparison',outcome,purpose,number,revision:card.revision,dataset:card.datasetId,cardId:card.cardId??null,viaCard:!!token};
  await env.DB.prepare('UPDATE audit_events SET payload=? WHERE id=?').bind(JSON.stringify(review),id).run();
  return reply(outcome==='awaiting review'?{reviewId:id,portrait:card.photoUrl}:{manual:true});
 }catch(error){
  if(auditId)await env.DB.prepare('UPDATE audit_events SET payload=? WHERE id=?').bind(JSON.stringify({kind:'photoComparison',outcome:'incomplete',purpose:req.headers.get('x-check-purpose')}),auditId).run().catch(()=>{});
  if(error instanceof Problem)return reply({error:error.message},error.status);
  if(error instanceof CardProblem)return reply({error:'An eligible, active record with a verified portrait is required. Use manual review.'},error.status);
  return reply({error:'Comparison unavailable. Use the manual identity check.'},503);
 }
}
