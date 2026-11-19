import assert from 'node:assert/strict';
import ts from 'typescript';
import sharp from 'sharp';
import jsQR from 'jsqr';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
mkdirSync('work',{recursive:true});
const dir=mkdtempSync(join(process.cwd(),'work','id-card-'));
const db=new PGlite();
const context={user:{userId:'issuer',displayName:'Test Issuer'},photoExists:true,failBatch:false};
class Statement {
 constructor(sql,args=[]){this.sql=sql;this.args=args;}
 bind(...args){return new Statement(this.sql,args);}
 expectChanges(count){this.expected=count;return this;}
 // Data API binds strings as PostgreSQL text, unlike a driver that leaves types unspecified.
 async result(){let n=0;return db.query(this.sql.replace(/\?/g,()=>{const value=this.args[n++];return typeof value==='string'?'CAST($'+n+' AS text)':'$'+n;}),this.args);}
 async first(){return (await this.result()).rows[0]??null;}
 async all(){return {results:(await this.result()).rows};}
 async run(){const result=await this.result();if(this.expected!==undefined&&result.affectedRows!==this.expected)throw Error('Revision conflict');return result;}
}
const env={DB:{dialect:'postgres',prepare:sql=>new Statement(sql),batch:async statements=>{
 await db.exec('BEGIN');try{for(const [i,s] of statements.entries()){await s.run();if(context.failBatch&&i===2)throw Error('Forced rollback');}await db.exec('COMMIT');}catch(e){await db.exec('ROLLBACK');context.lastDbError=e.message;throw e;}
}},BUCKET:{head:async()=>context.photoExists?{}:null}};
const config=async()=>{const row=await new Statement("SELECT payload,revision FROM registry WHERE id='excel-config'").first();return {...JSON.parse(row.payload),revision:row.revision};};
globalThis.__cardFixture={context,env,config};
process.env.APP_URL='https://registry.example';
try {
 for(const [path,name] of [['app/model.ts','model'],['app/quality.ts','quality'],['app/quality-postgres.ts','quality-postgres'],['app/id-card.ts','id-card'],['app/id-card-pdf.ts','id-card-pdf'],['app/server-id-card.ts','server-id-card'],['app/server-issued-cards.ts','server-issued-cards'],['app/api/id-cards/route.ts','list-route'],['app/api/id-card/route.ts','route']]){
  let source=readFileSync(path,'utf8').replace(/from '\.\/([^']+)'/g,"from './$1.mjs'");
  for(const name of ['server-id-card','server-issued-cards'])source=source.replaceAll("'../../"+name+"'","'./"+name+".mjs'");
  source=source.replaceAll("'@/lib/aws-runtime'","'./runtime.mjs'").replaceAll("'../../chatgpt-auth'","'./runtime.mjs'").replaceAll("'./server-registry.mjs'","'./runtime.mjs'");
  writeFileSync(join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
 }
 writeFileSync(join(dir,'runtime.mjs'),`export const {env,config}=globalThis.__cardFixture;export const CONFIG='excel-config';export const getChatGPTUser=async()=>globalThis.__cardFixture.context.user;`);
 await db.exec(readFileSync('infra/postgres/001-schema.sql','utf8'));
 await db.exec(readFileSync('infra/postgres/003-payroll-lifecycle.sql','utf8'));
 await db.exec(readFileSync('infra/postgres/004-issued-cards.sql','utf8'));
 const employee={id:'employee',number:'000123',first:'Sample',last:'Officer',gender:'Female',dob:'1990-01-01',position:'Registry Officer',agency:'agency',status:'Not provided',photo:'portraits/12345678-1234-1234-1234-123456789abc/000123.png',verified:true};
 await db.query('INSERT INTO organisations VALUES($1,$2,$3,$4)',['cycle:agency','cycle','agency',JSON.stringify({id:'agency',code:'001',name:'Example Department'})]);
 await db.query('INSERT INTO employees VALUES($1,$2,$3,$4,$5,$6,$7,$8)',['cycle:000123','cycle','000123','agency',employee.status,'sample officer',0,JSON.stringify(employee)]);
 await db.query("UPDATE registry SET payload=$1,revision=12 WHERE id='excel-config'",[JSON.stringify({dataset:'cycle',source:{asOf:'2026-11-19'},events:[]})]);
 const setEmployee=async patch=>{const e={...employee,...patch};await db.query("UPDATE employees SET payload=$1,status=$2 WHERE number='000123'",[JSON.stringify(e),e.status]);};
 const {GET,POST}=await import(pathToFileURL(join(dir,'route.mjs')));
 const {GET:listCards}=await import(pathToFileURL(join(dir,'list-route.mjs')));
 const listRequest=(query='')=>new Request('https://registry.example/api/id-cards'+query);
 const {verifyIdCard}=await import(pathToFileURL(join(dir,'server-id-card.mjs')));
 const request=number=>new Request('https://registry.example/api/id-card?'+new URLSearchParams({employeeNumber:number}));
 const issue=async(card,patch={},origin='https://registry.example')=>POST(new Request('https://registry.example/api/id-card',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({employeeNumber:'000123',datasetId:card.datasetId,revision:card.revision,confirmIssue:true,...patch})}));
 context.user=null;assert.equal((await GET(request('000123'))).status,401);assert.equal((await listCards(listRequest())).status,401);
 context.user={userId:'issuer',displayName:'Test Issuer'};
 assert.equal((await GET(request(' 000123'))).status,400);assert.equal((await GET(request('123'))).status,404);
 let response=await GET(request('000123'));assert.equal(response.status,200);
 let card=await response.json();
 assert.equal((await (await listCards(listRequest('?summary=1'))).json()).issued,0);assert.equal(card.status,'preview');assert.equal(card.gender,'Female');assert.equal('dob' in card,false);
 assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 for(const patch of [{number:'wrong-number'},{status:'Inactive'},{status:'Suspended'},{status:'Deceased'},{payrollAbsent:true},{verified:false},{sourceConflict:true},{photo:''},{gender:''},{dob:'2050-01-01'},{position:''}]){
  await setEmployee(patch);response=await GET(request('000123'));assert.equal(response.status,409,JSON.stringify(patch));assert.ok((await response.json()).checks.length);
 }
 await setEmployee({});context.photoExists=false;assert.equal((await GET(request('000123'))).status,409);context.photoExists=true;
 card=await (await GET(request('000123'))).json();
 assert.equal((await issue(card,{confirmIssue:false})).status,400);
 assert.equal((await issue(card,{},'https://other.example')).status,403);
 assert.equal((await issue(card,{revision:0})).status,409);
 context.failBatch=true;assert.equal((await issue(card)).status,503);context.failBatch=false;
 assert.equal((await db.query('SELECT * FROM registry_id_cards')).rows.length,0,'Atomic failure leaves no issued card');
 response=await issue(card);assert.equal(response.status,200,context.lastDbError);const issued=await response.json();assert.equal(issued.status,'issued');
 let list=await (await listCards(listRequest())).json();assert.equal(list.issued,1);assert.equal(list.cards.length,1);assert.equal(list.cards[0].employeeNumber,'000123');
 assert.deepEqual(Object.keys(list.cards[0]).sort(),['id','employeeNumber','issuedAt','name','agency','position','gender'].sort());
 assert.equal((await (await listCards(listRequest('?query=SAMPLE'))).json()).matched,1);
 assert.equal((await (await listCards(listRequest('?query=000123'))).json()).matched,1);
 assert.equal((await (await listCards(listRequest('?query=%25'))).json()).matched,0,'Search wildcard is escaped');
 assert.equal((await (await listCards(listRequest('?page=1'))).json()).cards.length,0);
 const token=issued.verificationUrl.split('/').pop();assert.match(token,/^[a-f0-9]{64}$/);
 assert.equal((await issue(card)).status,200,'Retry reuses committed issuance');
 assert.equal((await db.query('SELECT * FROM registry_id_cards')).rows.length,1);assert.equal((await db.query('SELECT * FROM audit_events')).rows.length,1);
 const rgba=await sharp(Buffer.from(issued.qrDataUrl.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(jsQR(new Uint8ClampedArray(rgba.data),rgba.info.width,rgba.info.height)?.data,issued.verificationUrl,'QR decodes to exact opaque verification URL');
 let verification=await verifyIdCard(token);assert.equal(verification.status,'valid');assert.equal(verification.employeeNumber,'000123');
 assert.deepEqual(Object.keys(verification).sort(),['status','checkedAt','employeeNumber','name','agency','position','gender'].sort());
 assert.equal((await verifyIdCard('000123')).status,'unknown');assert.equal((await verifyIdCard('preview')).status,'preview');
 await setEmployee({status:'Inactive'});verification=await verifyIdCard(token);assert.equal(verification.status,'inactive');assert.equal('name' in verification,false);
 await setEmployee({});assert.equal((await verifyIdCard(token)).status,'changed','Returning to payroll must not reactivate old ID');
 card=await (await GET(request('000123'))).json();assert.equal(card.needsReplacement,true);
 const replacement=await (await issue(card)).json();assert.equal((await verifyIdCard(token)).status,'superseded');
 list=await (await listCards(listRequest())).json();assert.equal(list.issued,1,'Superseded ID excluded');assert.equal(list.cards[0].id,replacement.cardId);
 const replacementToken=replacement.verificationUrl.split('/').pop();assert.equal((await verifyIdCard(replacementToken)).status,'valid');
 await setEmployee({position:'Manager'});assert.equal((await verifyIdCard(replacementToken)).status,'changed');
 await db.query("UPDATE registry_id_cards SET state='revoked' WHERE id=$1",[replacement.cardId]);assert.equal((await verifyIdCard(replacementToken)).status,'revoked');
 assert.equal((await (await listCards(listRequest())).json()).issued,0,'Revoked ID excluded');
 const {makeIdCardPdf}=await import(pathToFileURL(join(dir,'id-card-pdf.mjs')));
 const QRCode=(await import('qrcode')).default;
 const sample={...issued,status:'sample',verificationUrl:'https://main.d2p2kldeb52a64.amplifyapp.com/verify/preview',qrDataUrl:await QRCode.toDataURL('https://main.d2p2kldeb52a64.amplifyapp.com/verify/preview',{margin:4,width:360})};
 const assets={logo:'data:image/png;base64,'+readFileSync('public/png-state-emblem.png').toString('base64'),font:readFileSync('public/report-fonts/DejaVuSans.ttf').toString('base64'),bold:readFileSync('public/report-fonts/DejaVuSans-Bold.ttf').toString('base64')};
 const pdf=makeIdCardPdf(sample,assets);assert.equal(pdf.getNumberOfPages(),1);assert.equal(pdf.internal.pageSize.getWidth(),86);assert.equal(pdf.internal.pageSize.getHeight(),54);
 assert.equal(makeIdCardPdf({...sample,name:'Émilie Example'},assets).getNumberOfPages(),1);
 assert.throws(()=>makeIdCardPdf({...sample,name:'Overlong name '.repeat(200)},assets),/too long/);
 writeFileSync('work/Public_Servant_ID_Card_Sample.pdf',Buffer.from(pdf.output('arraybuffer')));
 await db.exec('DROP TABLE registry_id_cards');
 assert.equal((await (await listCards(listRequest())).json()).installed,false,'Missing setup has a clear empty state');
 console.log('ID card checks passed: readiness diagnostics, exact identifiers, approval, atomic rollback, idempotent issuance, QR decoding, authenticated issued-ID totals/search/pagination, public field limits, lifecycle invalidation, replacement/revocation and template PDF.');
} finally {delete globalThis.__cardFixture;await db.close();rmSync(dir,{recursive:true,force:true});}
