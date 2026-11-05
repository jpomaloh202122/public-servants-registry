import {writeFileSync} from 'node:fs';
// Explicit allowlist: ARNs and public configuration only. Never serialize AWS keys.
const keys=['APP_URL','COGNITO_DOMAIN','COGNITO_ISSUER','COGNITO_CLIENT_ID','REGISTRY_AWS_REGION','S3_BUCKET','DB_CLUSTER_ARN','DB_SECRET_ARN','DB_NAME'];
const lines=keys.filter(k=>process.env[k]).map(k=>k+'='+JSON.stringify(process.env[k]));
writeFileSync('.env.production',lines.join('\n')+'\n');
console.log('Prepared server runtime configuration ('+lines.length+' keys; no credentials).');
