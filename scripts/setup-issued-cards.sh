#!/usr/bin/env bash
# Run from an updated checkout. Keep SDK installation outside the CloudShell home quota.
set -euo pipefail
cd "$(dirname "$0")/.."
card_setup_dir=$(mktemp -d /tmp/ps-id-card-setup.XXXXXX)
trap 'rm -rf "$card_setup_dir"' EXIT
git archive HEAD | tar -x -C "$card_setup_dir"
cd "$card_setup_dir"
node -e 'require("fs").writeFileSync("package.json",JSON.stringify({private:true,type:"module"}))'
rm -f package-lock.json
npm install --ignore-scripts --no-audit --no-fund --cache /tmp/ps-id-npm-cache @aws-sdk/client-rds-data @aws-sdk/client-secrets-manager
AWS_REGION="${AWS_REGION:-ap-southeast-2}" node scripts/setup-issued-cards.mjs
AWS_REGION="${AWS_REGION:-ap-southeast-2}" node scripts/check-id-card-readiness.mjs
