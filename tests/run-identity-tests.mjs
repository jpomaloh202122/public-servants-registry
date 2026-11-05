import ts from 'typescript';import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';import assert from 'node:assert/strict';import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
mkdirSync('work',{recursive:true});const dir=mkdtempSync(join(process.cwd(),'work','identity-'));
try{
 const out=join(dir,'identity.mjs');writeFileSync(out,ts.transpileModule(readFileSync('lib/identity.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText);
 const {verifyRegistryToken}=await import(pathToFileURL(out));const {privateKey,publicKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='test';const key=createLocalJWKSet({keys:[jwk]});
 const config={issuer:'https://identity.example.test/pool',clientId:'registry',nonce:'browser-bound'};
 async function token(overrides={},audience=config.clientId,expiration='1h') {return new SignJWT({sub:'test-user',email:'user@example.test',email_verified:true,token_use:'id','cognito:groups':['RegistryUsers'],nonce:'browser-bound',...overrides}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer(config.issuer).setAudience(audience).setIssuedAt().setExpirationTime(expiration).sign(privateKey);}
 assert.equal((await verifyRegistryToken(await token(),config,key)).userId,'test-user');
 for(const claims of [{email_verified:false},{token_use:'access'},{'cognito:groups':[]},{nonce:'wrong'}])await assert.rejects(verifyRegistryToken(await token(claims),config,key));
 await assert.rejects(verifyRegistryToken(await token({},'another-app'),config,key));await assert.rejects(verifyRegistryToken(await token({},config.clientId,'-1s'),config,key));await assert.rejects(verifyRegistryToken('forged',config,key));
 console.log('Identity: signed approved user accepted; forged, expired, wrong client, unverified email, unapproved group, wrong token type and nonce rejected.');
}finally{rmSync(dir,{recursive:true,force:true});}
