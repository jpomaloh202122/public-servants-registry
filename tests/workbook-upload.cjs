const assert=require('node:assert/strict');
const ts=require('typescript');
const fs=require('node:fs');
const XLSX=require('xlsx');
const Module=require('node:module');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {legacyTables}=require('../app/legacy-workbook.ts');
const sheet=XLSX.utils.aoa_to_sheet([['Employee Number','Date of birth'],[42,32874]]);
sheet.A2.z='00000';sheet.B2.z='yyyy-mm-dd';
const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Employees');
const data=XLSX.write(book,{type:'array',bookType:'biff8'});
assert.deepEqual(legacyTables(data)[0].rows,[{'Employee Number':'00042','Date of birth':'1990-01-01'}]);
const rows=new Map();let user=null,object=null;
const mocks={
 '../../chatgpt-auth':{getChatGPTUser:async()=>user},
 '@/lib/object-storage':{uploadURL:async()=> 'https://example.test/put',downloadURL:async(_key,_name,version)=>'https://example.test/'+version},
 '@/lib/aws-runtime':{env:{BUCKET:{head:async()=>object},DB:{prepare(sql){return {bind(...args){return {
 async run(){if(sql.startsWith('INSERT'))rows.set(args[0],{revision:0,payload:args[1]});else rows.set(args[1],{revision:1,payload:args[0]});},
 async first(){return rows.get(args[0]);},async all(){return {results:[...rows.values()].filter(r=>r.revision===1)};}
 };}};}}}}
};
const load=Module._load;Module._load=function(name,...rest){return mocks[name]||load.call(this,name,...rest);};
const {POST,GET}=require('../app/api/workbook-uploads/route.ts');Module._load=load;
const url='https://registry.test/api/workbook-uploads';process.env.APP_URL='https://registry.test';
const post=data=>POST(new Request(url,{method:'POST',headers:{origin:process.env.APP_URL},body:JSON.stringify(data)}));
(async()=>{
 const start={action:'start',bytes:123,name:'Establishment.xls'};
 assert.equal((await post(start)).status,401);user={userId:'a'};
 assert.equal((await post({...start,name:'source.exe'})).status,400);
 const {id}=await (await post(start)).json();assert.ok(id);
 const finish={action:'finish',id};assert.equal((await post(finish)).status,409);
 object={ContentLength:123,VersionId:'original'};user.userId='b';assert.equal((await post(finish)).status,404);
 user.userId='a';assert.deepEqual(await (await post(finish)).json(),{received:true});
 object.VersionId='replacement';assert.deepEqual(await (await post(finish)).json(),{received:true});
 assert.equal((await GET(new Request(url))).status,403);assert.equal((await GET(new Request(url+'?id='+id))).status,403);
 user.canManageSources=true;assert.equal((await (await GET(new Request(url))).json()).items[0].name,start.name);
 assert.equal((await GET(new Request(url+'?id='+id))).headers.get('Location'),'https://example.test/original');
 console.log('Passed native XLS, upload receipt, private manager inbox, retry and version checks.');
})().catch(e=>{console.error(e);process.exitCode=1;});
