import {execFileSync} from 'node:child_process';
const region=process.env.AWS_REGION||'ap-southeast-2';
const aws=args=>JSON.parse(execFileSync('aws',[...args,'--region',region,'--output','json','--no-cli-pager'],{encoding:'utf8',stdio:['ignore','pipe','inherit']}));
if(aws(['sts','get-caller-identity']).Account!=='440660366630')throw Error('Use the approved registry account.');
const outputs=Object.fromEntries(aws(['cloudformation','describe-stacks','--stack-name',process.argv[2]||'ps-id-registry-backend']).Stacks[0].Outputs.map(o=>[o.OutputKey,o.OutputValue]));
if(!outputs.DbClusterArn||!outputs.DbSecretArn||!outputs.OwnerSecretArn||outputs.DbName!=='registry')throw Error('Missing registry stack outputs.');
execFileSync(process.execPath,['scripts/bootstrap-db.mjs'],{stdio:'inherit',env:{...process.env,AWS_REGION:region,DB_CLUSTER_ARN:outputs.DbClusterArn,DB_SECRET_ARN:outputs.DbSecretArn,OWNER_SECRET_ARN:outputs.OwnerSecretArn,DB_NAME:outputs.DbName}});
console.log('Issued-card storage and runtime access are ready. No employee has been approved or issued automatically.');
