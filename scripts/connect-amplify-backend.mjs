import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const [appId,branch='main',stack='ps-id-registry-backend']=process.argv.slice(2);
if(!/^d[a-z0-9]+$/.test(appId||''))throw Error('Usage: node scripts/connect-amplify-backend.mjs APP_ID [BRANCH] [STACK]');
const region=process.env.AWS_REGION||'ap-southeast-2';
function aws(args, payload) {
  const directory = payload === undefined ? undefined : mkdtempSync(join(tmpdir(), 'registry-aws-'));
  try {
    const inputArgs = [];
    if (directory) {
      const file = join(directory, 'input.json');
      writeFileSync(file, JSON.stringify(payload), {mode: 0o600});
      inputArgs.push('--cli-input-json', 'file://' + file);
    }
    const result = execFileSync('aws', [...args, ...inputArgs, '--region', region, '--output', 'json'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit']
    });
    return JSON.parse(result);
  } finally {
    if (directory) rmSync(directory, {recursive: true, force: true});
  }
}
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
aws(['amplify','update-app'],{appId,platform:'WEB_COMPUTE'});
aws(['amplify','update-branch'],{appId,branchName:branch,computeRoleArn:outputs.COMPUTE_ROLE_ARN,environmentVariables:{...existing,...config}});
const job=aws(['amplify','start-job','--app-id',appId,'--branch-name',branch,'--job-type','RELEASE']);
console.log('Backend linked to branch '+branch+'. Amplify build job: '+job.jobSummary.jobId);
console.log('After deployment, create approved Cognito users and assign RegistryUsers.');
