import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import sharp from 'sharp';

mkdirSync('work',{recursive:true});
const temp=mkdtempSync('work/photo-pilot-');
try{
 const route=readFileSync('app/api/photo-comparison/route.ts','utf8')
  .replace(/'(@aws-sdk\/client-rekognition|@\/lib\/aws-runtime|\.\.\/\.\.\/chatgpt-auth|\.\.\/\.\.\/server-id-card)'/g,"'./mock.mjs'");
 writeFileSync(join(temp,'route.mjs'),ts.transpileModule(route,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
 writeFileSync(join(temp,'mock.mjs'),`
 export const {env,getChatGPTUser,getIdCard,verifyIdCard}=globalThis.pilot;
 export const validEmployeeNumber=n=>!!n&&n.length<100;
 export class CardProblem extends Error {}
 export class DetectFacesCommand {constructor(input){this.input=input;}}
 export class CompareFacesCommand extends DetectFacesCommand {}
 export class RekognitionClient {async send(cmd){globalThis.pilot.calls++;if(cmd instanceof CompareFacesCommand&&cmd.input.SimilarityThreshold!==0)throw Error('Low scores excluded');return cmd instanceof CompareFacesCommand?{FaceMatches:[{Similarity:globalThis.pilot.score}]}:{FaceDetails:Array(globalThis.pilot.faces).fill({})};}}
 `);
 process.env.APP_URL='https://test.example';process.env.REGISTRY_AWS_REGION='ap-southeast-2';process.env.S3_BUCKET='test';
 const db=new Map(),token='a'.repeat(64);
 const card={revision:1,datasetId:'pilot',cardId:'card',status:'issued',verificationUrl:process.env.APP_URL+'/verify/'+token,employeeNumber:'001',name:'Pilot Participant',position:'Officer',agency:'Test',photoUrl:'/api/photo?key=portraits/fixture'};
 const p=globalThis.pilot={user:null,score:99.5,faces:1,calls:0,getChatGPTUser:async()=>p.user,getIdCard:async()=>({...card}),verifyIdCard:async()=>({status:'valid',employeeNumber:'001'}),env:{DB:{prepare(sql){return {bind(...args){return {
  async first(){if(sql.includes('COUNT'))return {total:0};const row=db.get(args[0]);return row&&row.actor===args[1]&&row.time>=args[2]?row:null;},
  async run(){if(sql.startsWith('INSERT')){const [id,time,actor,payload]=args;db.set(id,{time,actor,payload});}else{const [payload,id,actor,old]=args,row=db.get(id);if(actor&&(actor!==row.actor||old!==row.payload))return {meta:{changes:0}};row.payload=payload;}return {meta:{changes:1}};}
 };}};}}}};
 const {POST}=await import(pathToFileURL(join(temp,'route.mjs')));
 const img=await sharp({create:{width:90,height:120,channels:3,background:'white'}}).jpeg().toBuffer();
 const send=(claim='001',extra={})=>POST(new Request(process.env.APP_URL,{method:'POST',headers:{origin:process.env.APP_URL,'x-check-purpose':'ID presentation','x-pilot-consent':'yes','x-registry-claim':encodeURIComponent(claim),...extra},body:img}));
 const confirm=(id,fields={})=>POST(new Request(process.env.APP_URL,{method:'POST',headers:{origin:process.env.APP_URL,'content-type':'application/json'},body:JSON.stringify({reviewId:id,...fields})}));
 assert.equal((await send()).status,401);
 p.user={userId:'officer',canComparePhotos:false};assert.equal((await send()).status,403);
 p.user.canComparePhotos=true;assert.equal((await send('001',{origin:'https://other.example'})).status,403);
 assert.equal((await send('001',{'x-pilot-consent':'no'})).status,400);
 assert.equal((await send('https://other.example/verify/'+token)).status,400);assert.equal(p.calls,0);
 p.faces=2;assert.deepEqual(await (await send()).json(),{manual:true});
 p.faces=1;
 for(const score of [0,98.25,undefined]){
  p.score=score;const low=await (await send()).json();assert.equal(low.similarity,score??null);assert.equal(low.needsEvidence,true);
  assert.equal((await confirm(low.reviewId,{similarity:100})).status,400);
  const verified=await (await confirm(low.reviewId,{decision:'confirm',checkedId:true})).json();
  assert.equal(verified.person.employeeNumber,'001');assert.equal(verified.similarity,score??null);
  assert.equal(JSON.parse(db.get(low.reviewId).payload).checkedSupportingId,true);
 }
 p.score=99;const boundary=await (await send()).json();assert.equal(boundary.needsEvidence,false);
 const decline=await (await confirm(boundary.reviewId,{decision:'decline'})).json();assert.deepEqual(decline,{declined:true,similarity:99});
 assert.equal((await confirm(boundary.reviewId)).status,409);

 p.score=100;const review=await (await send(card.verificationUrl)).json();assert.ok(review.reviewId);assert.equal(review.person,undefined);
 p.user.userId='other';assert.equal((await confirm(review.reviewId)).status,409);
 p.user.userId='officer';assert.equal((await (await confirm(review.reviewId)).json()).person.employeeNumber,'001');
 assert.equal((await confirm(review.reviewId)).status,409);
 const stale=await (await send()).json();card.revision++;assert.equal((await confirm(stale.reviewId)).status,409);
 const expired=await (await send()).json();db.get(expired.reviewId).time='2000-01-01';assert.equal((await confirm(expired.reviewId)).status,409);
 assert.ok(!JSON.stringify([...db]).includes(token));console.log('Pilot authorization, consent, QR origin, face count, cutoff, officer review, expiry, stale records and replay tests passed.');
}finally{rmSync(temp,{recursive:true,force:true});}
