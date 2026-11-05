import {createRemoteJWKSet,jwtVerify,type JWTVerifyGetKey} from 'jose';
export type RegistryUser={userId:string;displayName:string;email:string;fullName:string|null};
const keysets=new Map<string,JWTVerifyGetKey>();
export async function verifyRegistryToken(token:string,config:{issuer:string;clientId:string;nonce?:string},key?:JWTVerifyGetKey):Promise<RegistryUser>{
 if(!key){key=keysets.get(config.issuer);if(!key){key=createRemoteJWKSet(new URL(config.issuer+'/.well-known/jwks.json'));keysets.set(config.issuer,key);}}
 const {payload:p}=await jwtVerify(token,key,{issuer:config.issuer,audience:config.clientId,algorithms:['RS256']});
 if(config.nonce!==undefined&&p.nonce!==config.nonce)throw Error('Invalid sign-in nonce');
 if(p.token_use!=='id'||p.email_verified!==true||!p.sub||typeof p.email!=='string'||!Array.isArray(p['cognito:groups'])||!p['cognito:groups'].includes('RegistryUsers'))throw Error('Registry access is not approved.');
 return {userId:p.sub,email:p.email,displayName:String(p.name||p.email),fullName:typeof p.name==='string'?p.name:null};
}
