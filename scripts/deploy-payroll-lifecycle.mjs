import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
const region = process.env.AWS_REGION || 'ap-southeast-2';
const stack = process.argv[2] || 'ps-id-registry-backend';
const directory = mkdtempSync(join(tmpdir(),'registry-lifecycle-'));
function aws(args, allowMissing = false) {
 try {
  const output = execFileSync('aws',[...args,'--region',region,'--output','json'],
   {encoding:'utf8',stdio:['ignore','pipe','pipe']});
  return output.trim() ? JSON.parse(output) : {};
 } catch (error) {
  const message = String(error.stderr || '');
  if (allowMissing && message.includes('does not exist')) return null;
  throw new Error(message.trim() || 'AWS CLI command failed.');
 }
}
try {
 if(aws(['sts','get-caller-identity']).Account!=='440660366630')throw Error('Use the approved registry account.');
 const values=aws(['cloudformation','describe-stacks','--stack-name',stack]).Stacks[0].Outputs;
 const outputs=Object.fromEntries(values.map(item=>[item.OutputKey,item.OutputValue]));
 const env={...process.env,AWS_REGION:region,DB_CLUSTER_ARN:outputs.DbClusterArn,DB_SECRET_ARN:outputs.DbSecretArn,
  OWNER_SECRET_ARN:outputs.OwnerSecretArn,DB_NAME:outputs.DbName};
 if(!env.DB_CLUSTER_ARN||!env.DB_SECRET_ARN||!env.OWNER_SECRET_ARN||env.DB_NAME!=='registry'||!outputs.S3Bucket)
  throw Error('Missing registry stack outputs.');
 const webhookStack = stack+'-webhooks';
 let webhookState = aws(['cloudformation','describe-stacks','--stack-name',webhookStack],true)?.Stacks[0].StackStatus;
 if (webhookState === 'ROLLBACK_IN_PROGRESS') {
  execFileSync('aws',['cloudformation','wait','stack-rollback-complete','--stack-name',webhookStack,'--region',region],{stdio:'inherit'});
  webhookState = aws(['cloudformation','describe-stacks','--stack-name',webhookStack]).Stacks[0].StackStatus;
 }
 if (webhookState === 'ROLLBACK_COMPLETE') {
  console.log('Recreating the failed webhook deployment stack '+webhookStack+'.');
  aws(['cloudformation','delete-stack','--stack-name',webhookStack]);
  execFileSync('aws',['cloudformation','wait','stack-delete-complete','--stack-name',webhookStack,'--region',region],{stdio:'inherit'});
 } else if (webhookState && !['CREATE_COMPLETE','UPDATE_COMPLETE','UPDATE_ROLLBACK_COMPLETE','REVIEW_IN_PROGRESS'].includes(webhookState)) {
  throw Error('Inspect webhook stack state '+webhookState+' before retrying.');
 }
 // Idempotent schema setup. No live employee state changes until a later source activation or edit.
 execFileSync(process.execPath,['scripts/bootstrap-db.mjs'],{env,stdio:'inherit'});
 writeFileSync(join(directory,'worker.mjs'),readFileSync('infra/webhooks/worker.mjs'));
 const archive=join(directory,'worker.zip');
 execFileSync('zip',['-q',archive,'worker.mjs'],{cwd:directory});
 const key='deployment/payroll-webhooks/'+createHash('sha256').update(readFileSync(archive)).digest('hex')+'.zip';
 execFileSync('aws',['s3','cp',archive,'s3://'+outputs.S3Bucket+'/'+key,'--region',region],{stdio:'inherit'});
 execFileSync('aws',['cloudformation','deploy','--region',region,'--stack-name',stack+'-webhooks',
  '--template-file',resolve('infra/payroll-webhooks.yaml'),'--capabilities','CAPABILITY_IAM',
  '--no-fail-on-empty-changeset','--parameter-overrides','ClusterArn='+outputs.DbClusterArn,
  'DatabaseSecretArn='+outputs.DbSecretArn,'ArtifactBucket='+outputs.S3Bucket,'ArtifactKey='+key],{stdio:'inherit'});
 console.log(JSON.stringify(aws(['cloudformation','describe-stacks','--stack-name',stack+'-webhooks']).Stacks[0].Outputs,null,2));
 console.log('Lifecycle triggers installed. Configure the webhook secret with the approved partner URLs and signing secrets before delivery.');
} finally {
 rmSync(directory,{recursive:true,force:true});
}
