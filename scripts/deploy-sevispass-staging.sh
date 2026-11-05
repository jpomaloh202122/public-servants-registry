#!/usr/bin/env bash
set -euo pipefail

: "${AMPLIFY_APP_ID:?Create the separate staging Amplify app and set AMPLIFY_APP_ID}"
export AWS_REGION="${AWS_REGION:-ap-southeast-2}"
export AMPLIFY_BRANCH="${AMPLIFY_BRANCH:-main}"

if [[ "$AWS_REGION" != ap-southeast-2 || "$AMPLIFY_APP_ID" == d2p2kldeb52a64 ]]; then
  echo 'Use a separate Amplify staging app in ap-southeast-2.' >&2
  exit 1
fi

app_name=$(aws amplify get-app --app-id "$AMPLIFY_APP_ID" --region "$AWS_REGION" --query app.name --output text)
if [[ "$app_name" != ps-id-registry-staging ]]; then
  echo 'Expected the separate Amplify app named ps-id-registry-staging.' >&2
  exit 1
fi

domain=$(aws amplify get-app --app-id "$AMPLIFY_APP_ID" --region "$AWS_REGION" --query app.defaultDomain --output text)
if [[ "$domain" != "$AMPLIFY_APP_ID.amplifyapp.com" ]]; then
  echo 'The Amplify default domain did not match the staging app ID.' >&2
  exit 1
fi

export APP_URL="https://$AMPLIFY_BRANCH.$domain"
export REGISTRY_STACK_NAME=ps-id-registry-staging
printf 'Registry staging URL: %s\n' "$APP_URL"
bash scripts/deploy-amplify-backend.sh
