import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';

mkdirSync('work',{recursive:true});
const dir=mkdtempSync(join(process.cwd(),'work','sevispass-'));
try {
  const compile=(source,name)=>writeFileSync(join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
  compile(readFileSync('lib/sevispass-auth.ts','utf8'),'auth');
  const {verifySevisPassToken,eligibilityScope}=await import(pathToFileURL(join(dir,'auth.mjs')));
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const key=createLocalJWKSet({keys:[await exportJWK(publicKey)]});
  const config={issuer:'https://issuer.example.test',audience:'registry-api',clientId:'sevispass-service'};
  const token=(claims={},audience=config.audience,expiration='1m')=>new SignJWT({
    token_use:'access',client_id:config.clientId,scope:eligibilityScope,...claims,
  }).setProtectedHeader({alg:'RS256'}).setIssuer(config.issuer).setAudience(audience).setExpirationTime(expiration).sign(privateKey);
  assert.equal(await verifySevisPassToken(await token(),config,key),true);
  for(const claims of [{client_id:'staff'},{scope:'other'},{token_use:'id'}]){
    assert.equal(await verifySevisPassToken(await token(claims),config,key),false);
  }
  await assert.rejects(async()=>verifySevisPassToken(await token({},'wrong'),config,key));
  await assert.rejects(async()=>verifySevisPassToken(await token({},config.audience,'-1s'),config,key));

  for(const name of ['model','quality','quality-postgres']){
    compile(readFileSync('app/'+name+'.ts','utf8').replace(/from '\.\/([^']+)'/g,"from './$1.mjs'"),name);
  }
  globalThis.__sevispassFixture={
    verify:(value,settings)=>verifySevisPassToken(value,settings,key),
    lookup:(dataset,number)=>{
      assert.equal(dataset,'cycle');
      return number==='000123'?{payload:JSON.stringify({number,first:'Synthetic',last:'Officer',gender:'F',dob:'1990-01-01',position:'Officer',agency:'agency',status:'Not provided',photo:'portraits/example',verified:true})}:null;
    },
  };
  writeFileSync(join(dir,'fixture.mjs'),`
    export const config=async()=>({dataset:'cycle',revision:12,source:{asOf:'2026-11-06'}});
    export const verifySevisPassToken=globalThis.__sevispassFixture.verify;
    export const env={DB:{prepare:()=>({bind:(...args)=>({first:async()=>globalThis.__sevispassFixture.lookup(...args)})})}};
  `);
  compile(readFileSync('app/api/v1/sevispass/eligibility/route.ts','utf8')
    .replace(/'@\/lib\/(aws-runtime|sevispass-auth)'/g,"'./fixture.mjs'")
    .replace("'../../../../server-registry'","'./fixture.mjs'")
    .replace("'../../../../quality'","'./quality.mjs'")
    .replace("'../../../../model'","'./model.mjs'"),'route');
  const {POST}=await import(pathToFileURL(join(dir,'route.mjs')));
  const bearer=await token();
  const request=(number,authorization=bearer)=>new Request('https://registry.example.test/api/v1/sevispass/eligibility',{
    method:'POST',headers:{Authorization:'Bearer '+authorization,'Content-Type':'application/json'},
    body:JSON.stringify({employeeNumber:number}),
  });
  delete process.env.SEVISPASS_TOKEN_ISSUER;
  assert.equal((await POST(request('000123'))).status,503);
  process.env.SEVISPASS_TOKEN_ISSUER=config.issuer;
  process.env.SEVISPASS_TOKEN_AUDIENCE=config.audience;
  process.env.SEVISPASS_CLIENT_ID=config.clientId;
  assert.equal((await POST(request('000123','forged'))).status,401);
  assert.equal((await POST(request('000123',await token({scope:'other'})))).status,403);
  assert.equal((await POST(request(123))).status,400);
  const match=await (await POST(request('000123'))).json();
  assert.equal(match.employeeNumber,'000123');
  assert.equal(match.decision,'pending_review');
  assert.equal(match.registryReady,true);
  assert.equal('photo' in match,false);
  const missing=await (await POST(request('123'))).json();
  assert.equal(missing.decision,'not_found');
  assert.equal('employeeNumber' in missing,false);
  console.log('SevisPass lookup tests passed.');
} finally {
  rmSync(dir,{recursive:true,force:true});
}
