# SevisPass staging setup

Use SevisPNGSandbox in Sydney (`ap-southeast-2`). In Amplify Hosting, create a separate app named `ps-id-registry-staging` from this GitHub repository and connect the main branch. Record the app ID. The existing live app ID is rejected by the staging wrapper. Aurora resources in the new stack are billable.

From the updated repository folder in AWS CloudShell:

```bash
npm ci --ignore-scripts --cache /tmp/ps-id-npm-cache
AMPLIFY_APP_ID=YOUR_STAGING_APP_ID bash scripts/deploy-sevispass-staging.sh
```

The wrapper derives the HTTPS staging URL, deploys the separate `ps-id-registry-staging` stack, bootstraps its database, and links the Amplify branch. The seed runs only against the staging stack and requires empty registry tables. Repeating deployment with the synthetic snapshot active preserves it. The fixture has one active synthetic officer `000123` and no record `000124`.

For the dedicated service issuer, use a globally unique lowercase Cognito domain prefix:

```bash
aws cloudformation deploy --region ap-southeast-2 \
  --stack-name ps-id-sevispass-staging-identity \
  --template-file infra/sevispass-staging-identity.yaml \
  --parameter-overrides DomainPrefix=YOUR_UNIQUE_LOWERCASE_PREFIX
```

Use the stack outputs to identify the issuer, token endpoint and client ID. Retrieve the app client secret through authorised AWS access and keep it in a secret store. The template does not output the secret.

Before enabling the API, issue a staging token with the dedicated client and inspect its claims locally. Confirm it includes the agreed `aud`, issuer, client ID and `registry/pspass.eligibility.read` scope. The token flow must meet the registry's current audience requirement. If the issued token lacks `aud`, stop here and agree an audience-bearing token configuration with the integration team.

After configuring the three SevisPass settings on the staging Amplify branch and redeploying, run the smoke test. For Bash, paste the short-lived token at the hidden prompt:

```bash
read -rs -p 'Staging service token: ' sevispass_token
printf '\n'
printf '%s' "$sevispass_token" | node scripts/check-sevispass-staging.mjs \
  https://main.YOUR_STAGING_APP_ID.amplifyapp.com 000123 000124
unset sevispass_token
```

A successful lookup returns `pending_review`. The test verifies authentication, exact identifier handling and the allowed response fields.
