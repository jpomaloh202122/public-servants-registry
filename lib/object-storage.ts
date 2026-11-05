import 'server-only';
import {S3Client,PutObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
const client=new S3Client({region:process.env.REGISTRY_AWS_REGION||process.env.AWS_REGION});
function bucket(){if(!process.env.S3_BUCKET)throw Error('S3_BUCKET must be configured.');return process.env.S3_BUCKET;}
export async function uploadURL(key:string,bytes:number){return getSignedUrl(client,new PutObjectCommand({Bucket:bucket(),Key:key,ContentLength:bytes,ContentType:'application/octet-stream'}),{expiresIn:300});}
export async function downloadURL(key:string,filename:string,versionId?:string){return getSignedUrl(client,new GetObjectCommand({Bucket:bucket(),Key:key,VersionId:versionId,ResponseContentType:'application/octet-stream',ResponseContentDisposition:`attachment; filename="${filename.replace(/[^a-zA-Z0-9_.-]/g,'_')}"`}),{expiresIn:60});}
