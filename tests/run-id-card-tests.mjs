import assert from 'node:assert/strict';
import ts from 'typescript';
import sharp from 'sharp';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
mkdirSync('work',{recursive:true});
const dir=mkdtempSync(join(process.cwd(),'work','id-card-'));
try {
 for(const [path,name] of [['app/model.ts','model'],['app/quality.ts','quality'],['app/quality-postgres.ts','quality-postgres'],
 ['app/id-card.ts','id-card'],['app/id-card-pdf.ts','id-card-pdf'],['app/api/id-card/route.ts','route']]){
  let source=readFileSync(path,'utf8').replace(/from '\.\/([^']+)'/g,"from './$1.mjs'");
  for(const name of ['model','quality','id-card'])source=source.replaceAll("'../../"+name+"'","'./"+name+".mjs'");
  source=source.replaceAll("'@/lib/aws-runtime'","'./runtime.mjs'").replaceAll("'../../chatgpt-auth'","'./runtime.mjs'").replaceAll("'../../server-registry'","'./runtime.mjs'");
  writeFileSync(join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
 }
 const employee={id:'employee',number:'000123',first:'Sample',last:'Officer',gender:'Female',dob:'1990-01-01',position:'Registry Officer',
  agency:'agency',status:'Not provided',photo:'portraits/12345678-1234-1234-1234-123456789abc/000123.png',verified:true};
 const context={user:{userId:'approved'},employee:{...employee},organisation:{id:'agency',code:'001',name:'Example Department'},
  revision:12,changed:false,reads:0,lookupNumber:'000123'};
 globalThis.__cardFixture=context;
 writeFileSync(join(dir,'runtime.mjs'),`
 const fixture=globalThis.__cardFixture;
 export const getChatGPTUser=async()=>fixture.user;
 export const config=async()=>({dataset:'cycle',revision:fixture.revision+(fixture.changed&&fixture.reads++>0?1:0),source:{asOf:'2026-11-19'}});
 export const env={DB:{prepare:sql=>({bind:(dataset,key)=>{
 if(dataset!=='cycle')throw Error('Unexpected dataset');
 const value=sql.includes('FROM employees')?(key===fixture.lookupNumber?fixture.employee:null):fixture.organisation;
 return {first:async()=>value?{payload:JSON.stringify(value)}:null};
 }})}};
 `);
 const {GET}=await import(pathToFileURL(join(dir,'route.mjs')));
 const request=number=>new Request('https://registry.test/api/id-card?'+new URLSearchParams({employeeNumber:number}));
 context.user=null;assert.equal((await GET(request('000123'))).status,401);
 context.user={userId:'approved'};
 assert.equal((await GET(request(' 000123'))).status,400);
 assert.equal((await GET(request('123'))).status,404);
 let response=await GET(request('000123'));
 assert.equal(response.status,200);
 assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 const card=await response.json();
 assert.equal(card.employeeNumber,'000123');assert.equal(card.status,'preview');
 assert.equal('dob' in card,false);assert.equal('gender' in card,false);
 for(const patch of [{number:'wrong-number'},{status:'Inactive'},{status:'Suspended'},{status:'Deceased'},{payrollAbsent:true},{verified:false},{sourceConflict:true},{photo:''},{gender:''},{dob:'2050-01-01'},{position:''}]){
  context.employee={...employee,...patch};
  assert.equal((await GET(request('000123'))).status,409,JSON.stringify(patch));
 }
 context.employee={...employee};
 context.organisation=null;assert.equal((await GET(request('000123'))).status,409);
 context.organisation={id:'agency',code:'001',name:'Example Department'};
 context.changed=true;context.reads=0;
 assert.equal((await GET(request('000123'))).status,409);
 context.changed=false;
 const {makeIdCardPdf}=await import(pathToFileURL(join(dir,'id-card-pdf.mjs')));
 // Synthetic illustration used only for layout QA, never an employee's portrait.
 const silhouette=Buffer.from('<svg width="350" height="450" xmlns="http://www.w3.org/2000/svg"><rect width="350" height="450" fill="#e9edf1"/><circle cx="175" cy="150" r="68" fill="#9ba7b4"/><path d="M55 420V345a120 120 0 0 1 240 0v75" fill="#9ba7b4"/><text x="175" y="440" text-anchor="middle" font-size="18" fill="#485360">SYNTHETIC SAMPLE</text></svg>');
 const photo=await sharp(silhouette).png().toBuffer();
 const assets={
  logo:'data:image/png;base64,'+readFileSync('public/gpo-emblem-transparent.png').toString('base64'),
  photo:'data:image/png;base64,'+photo.toString('base64'),
  font:readFileSync('public/report-fonts/DejaVuSans.ttf').toString('base64'),
  bold:readFileSync('public/report-fonts/DejaVuSans-Bold.ttf').toString('base64')
 };
 const pdf=makeIdCardPdf(card,assets);
 assert.equal(pdf.getNumberOfPages(),2);
 const jpeg=await sharp(photo).jpeg().toBuffer();
 assert.equal(makeIdCardPdf(card,{...assets,photo:'data:image/png;base64,'+jpeg.toString('base64')}).getNumberOfPages(),2);
 assert.equal(makeIdCardPdf({...card,name:'Émilie Example'},assets).getNumberOfPages(),2);
 assert.equal(pdf.internal.pageSize.getWidth(),86);
 assert.equal(pdf.internal.pageSize.getHeight(),54);
 assert.throws(()=>makeIdCardPdf({...card,name:'Overlong name '.repeat(200)},assets),/too long/);
 writeFileSync('work/Public_Servant_ID_Card_Sample.pdf',Buffer.from(pdf.output('arraybuffer')));
 console.log('ID card tests passed: authenticated exact lookup, readiness exclusions, missing organisation, revision conflict, Unicode-capable two-sided PDF and overlong-field rejection.');
} finally {delete globalThis.__cardFixture;rmSync(dir,{recursive:true,force:true});}
