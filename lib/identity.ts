import {createRemoteJWKSet,jwtVerify,type JWTVerifyGetKey} from 'jose';
export type RegistryUser={registryMember:boolean;canComparePhotos:boolean;canManageSources:boolean;userId:string;displayName:string;email:string;fullName:string|null};
const keysets=new Map<string,JWTVerifyGetKey>();
export async function verifyRegistryToken(token:string,config:{issuer:string;clientId:string;nonce?:string;allowManaged?:boolean},key?:JWTVerifyGetKey):Promise<RegistryUser>{
 if(!key){key=keysets.get(config.issuer);if(!key){key=createRemoteJWKSet(new URL(config.issuer+'/.well-known/jwks.json'));keysets.set(config.issuer,key);}}
 const {payload:p}=await jwtVerify(token,key,{issuer:config.issuer,audience:config.clientId,algorithms:['RS256']});
 if(config.nonce!==undefined&&p.nonce!==config.nonce)throw Error('Invalid sign-in nonce');
 const groups=Array.isArray(p['cognito:groups'])?p['cognito:groups']:[];
 const registryMember=groups.includes('RegistryUsers');
 if(p.token_use!=='id'||p.email_verified!==true||!p.sub||typeof p.email!=='string'||(!config.allowManaged&&!registryMember))throw Error('Registry access is not approved.');
 return {registryMember,canComparePhotos:groups.includes('RegistryPhotoVerifiers'),canManageSources:groups.includes('RegistrySourceManagers'),userId:p.sub,email:p.email,displayName:String(p.name||p.email),fullName:typeof p.name==='string'?p.name:null};
}
