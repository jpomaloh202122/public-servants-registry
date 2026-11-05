import sharp from 'sharp';import {createRequire} from 'node:module';import ts from 'typescript';import assert from 'node:assert/strict';import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'registry-photo-'));const objects=new Map();
try{
 globalThis.__photoTest={user:{userId:'approved'},env:{BUCKET:{async put(k,body,options){objects.set(k,{body,httpMetadata:options.httpMetadata});},async get(k){return objects.get(k)||null;}}}};
 let source=readFileSync('app/api/photo/route.ts','utf8').replace("'sharp'",JSON.stringify(pathToFileURL(createRequire(import.meta.url).resolve('sharp')).href)).replace("'@/lib/aws-runtime'","'./runtime.mjs'").replace("'../../chatgpt-auth'","'./runtime.mjs'");writeFileSync(join(dir,'route.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
 writeFileSync(join(dir,'runtime.mjs'),'export const env=globalThis.__photoTest.env;export const getChatGPTUser=async()=>globalThis.__photoTest.user;');
 const {GET,POST}=await import(pathToFileURL(join(dir,'route.mjs')));
 function request(bytes,type){const form=new FormData();form.set('file',new File([bytes],'portrait',{type}));return new Request('https://test/api/photo',{method:'POST',body:form});}
 const png=await sharp({create:{width:350,height:450,channels:3,background:'white'}}).png().toBuffer();
 const undersized=await sharp({create:{width:200,height:200,channels:3,background:'white'}}).png().toBuffer();
 assert.equal((await POST(request(undersized,'image/png'))).status,400);
 assert.equal((await POST(request(new Uint8Array(10),'image/svg+xml'))).status,400);assert.equal((await POST(request(new Uint8Array(5*1024*1024+1),'image/png'))).status,400);
 const uploaded=await POST(request(png,'image/png'));assert.equal(uploaded.status,200);const {key}=await uploaded.json();assert.match(key,/^portraits\/[a-f0-9-]+$/);const photo=await GET(new Request('https://test/api/photo?key='+key));assert.equal(photo.headers.get('Content-Type'),'image/png');assert.equal(photo.headers.get('Cache-Control'),'private, no-store');assert.equal((await photo.arrayBuffer()).byteLength,png.length);
 assert.equal((await GET(new Request('https://test/api/photo?key=../secret'))).status,404);globalThis.__photoTest.user=null;assert.equal((await GET(new Request('https://test/api/photo?key='+key))).status,401);assert.equal((await POST(request(png,'image/png'))).status,401);
 console.log('Photos: approved PNG upload/read, size/type rejection, private cache, key validation and unauthenticated rejection passed (mock S3).');
}finally{rmSync(dir,{recursive:true,force:true});}
