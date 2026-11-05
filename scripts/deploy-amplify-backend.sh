#!/usr/bin/env bash
set -euo pipefail
: "${AMPLIFY_APP_ID:?Set AMPLIFY_APP_ID from your Amplify app}"
: "${APP_URL:?Set APP_URL to your exact Amplify HTTPS origin, without trailing slash}"
export AWS_REGION="${AWS_REGION:-ap-southeast-2}"
registry_account=$(aws sts get-caller-identity --query Account --output text)
if [ "$registry_account" != '440660366630' ]; then
  echo 'Expected SevisPNGSandbox account 440660366630; stopped before creating resources.' >&2
  exit 1
fi
registry_engine=$(aws rds describe-db-engine-versions --engine aurora-postgresql --query 'DBEngineVersions[].EngineVersion' --output json | python3 -c 'import json,sys; v=[x for x in json.load(sys.stdin) if x.startswith("16.")]; print(sorted(v,key=lambda x:tuple(map(int,x.split("."))))[-1] if v else "")')
if [ -z "$registry_engine" ]; then echo 'No Aurora PostgreSQL 16 engine found in this region.' >&2; exit 1; fi
printf 'Deploying Cognito, private S3 and billable Aurora Serverless v2 (0.5–2 ACUs) in %s.\n' "$AWS_REGION"
aws cloudformation deploy --stack-name ps-id-registry-backend \
  --template-file infra/amplify-backend.yaml --capabilities CAPABILITY_IAM \
  --parameter-overrides "AppOrigin=$APP_URL" "AmplifyAppId=$AMPLIFY_APP_ID" \
  "CognitoPrefix=ps-id-$registry_account-$AMPLIFY_APP_ID" "DatabaseEngineVersion=$registry_engine"
node scripts/connect-amplify-backend.mjs "$AMPLIFY_APP_ID" "${AMPLIFY_BRANCH:-main}"
