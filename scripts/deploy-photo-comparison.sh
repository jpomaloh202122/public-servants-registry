#!/usr/bin/env bash
set -euo pipefail
region=ap-southeast-2
backend=${REGISTRY_STACK_NAME:-ps-id-registry-backend}
outputs=$(aws cloudformation describe-stacks --stack-name "$backend" --region "$region" --query 'Stacks[0].Outputs' --output json)
read -r pool role < <(python3 -c 'import json,sys
d={o["OutputKey"]:o["OutputValue"] for o in json.load(sys.stdin)}
print(d["UserPoolId"],d["ComputeRoleArn"].split("/")[-1])' <<<"$outputs")
aws cloudformation deploy --region "$region" --stack-name "$backend-photo-pilot" \
  --template-file "$(dirname "$0")/../infra/photo-comparison.yaml" --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides "UserPoolId=$pool" "ComputeRoleName=$role"
printf 'Verifier group ready in %s. Designated officers need both RegistryUsers and RegistryPhotoVerifiers, then a fresh sign-in.\n' "$pool"
