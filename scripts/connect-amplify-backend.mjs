import {execFileSync} from 'node:child_process';
const [appId,branch='main',stack='ps-id-registry-backend']=process.argv.slice(2);
if(!/^d[a-z0-9]+$/.test(appId||''))throw Error('Usage: node scripts/connect-amplify-backend.mjs APP_ID [BRANCH] [STACK]');
const region=process.env.AWS_REGION||'ap-southeast-2';
function aws(args,input){return JSON.parse(execFileSync('aws',[...args,'--region',region,'--output','json'],{encoding:'utf8',input,stdio:['pipe','pipe','inherit']}));}
const stacks=aws(['cloudformation','describe-stacks','--stack-name',stack]);
const stackOutputs=Object.fromEntries(stacks.Stacks[0].Outputs.map(o=>[o.OutputKey,o.OutputValue]));
const outputNames={
  "S3_BUCKET": "S3Bucket",
  "COGNITO_DOMAIN": "CognitoDomain",
  "COGNITO_ISSUER": "CognitoIssuer",
  "COGNITO_CLIENT_ID": "CognitoClientId",
  "USER_POOL_ID": "UserPoolId",
  "APP_URL": "AppUrl",
  "REGISTRY_AWS_REGION": "RegistryAwsRegion",
  "DB_CLUSTER_ARN": "DbClusterArn",
  "DB_SECRET_ARN": "DbSecretArn",
  "DB_NAME": "DbName",
  "OWNER_SECRET_ARN": "OwnerSecretArn",
  "COMPUTE_ROLE_ARN": "ComputeRoleArn"
};
const outputs=Object.fromEntries(Object.entries(outputNames).map(([key,name])=>[key,stackOutputs[name]]));
const allowed=['APP_URL','COGNITO_DOMAIN','COGNITO_ISSUER','COGNITO_CLIENT_ID','REGISTRY_AWS_REGION','S3_BUCKET','DB_CLUSTER_ARN','DB_SECRET_ARN','DB_NAME'];
for(const key of [...allowed,'OWNER_SECRET_ARN','COMPUTE_ROLE_ARN'])if(!outputs[key])throw Error('Missing stack output '+key);
// Credentials are read by AWS SDK in the child only; no values are printed or stored.
execFileSync(process.execPath,['scripts/bootstrap-db.mjs'],{stdio:'inherit',env:{...process.env,...Object.fromEntries([...allowed,'OWNER_SECRET_ARN'].map(k=>[k,outputs[k]]))}});
const currentBranch=aws(['amplify','get-branch','--app-id',appId,'--branch-name',branch]).branch;
const existing=currentBranch.environmentVariables||{};
const config=Object.fromEntries(allowed.map(k=>[k,outputs[k]]));
aws(['amplify','update-app','--cli-input-json','file:///dev/stdin'],JSON.stringify({appId,platform:'WEB_COMPUTE'}));
aws(['amplify','update-branch','--cli-input-json','file:///dev/stdin'],JSON.stringify({appId,branchName:branch,computeRoleArn:outputs.COMPUTE_ROLE_ARN,environmentVariables:{...existing,...config}}));
const job=aws(['amplify','start-job','--app-id',appId,'--branch-name',branch,'--job-type','RELEASE']);
console.log('Backend linked to branch '+branch+'. Amplify build job: '+job.jobSummary.jobId);
console.log('After deployment, create approved Cognito users and assign RegistryUsers.');
