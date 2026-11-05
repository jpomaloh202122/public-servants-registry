# Public Servants Registry — PS ID

Next.js App Router port of the existing Government Payroll Office registry. Preserves the existing UI, employee and organisation search, data quality dashboards, source uploads, photos, CSV/Excel/PDF reporting, database exports, and source snapshot history. No production payroll data is included.

## AWS design

- Next.js Node.js 24 container on one EC2 instance, behind Caddy HTTPS.
- SQLite on encrypted, retained EBS. All users access the same server database.
- Private versioned S3 for source archives and photographs, accessed through the instance role.
- Cognito authorisation-code sign-in with PKCE, verified ID tokens, required MFA, administrator-created accounts, and the `RegistryUsers` approval group.
- Daily AWS Backup snapshots, retained for 30 days. Perform a restore drill before production use.

This initial deployment deliberately runs one application container and one database writer. It is not a highly available payroll platform. Do not scale it horizontally or put the SQLite file on EFS. For high availability, plan a separate migration of the SQLite-specific quality SQL to RDS PostgreSQL. Application roles and agency-specific permissions are not implemented: every approved RegistryUsers member has registry-wide access. SevisPass integration is not yet implemented.

## Development

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Configure Cognito and S3 using `.env.example`. Secure cookies require HTTPS for sign-in. No development bypass is provided. Local tests use synthetic fixtures and do not require AWS credentials.

```sh
npm run typecheck
npm run test:quality
npm run test:imports
npm run test:reports
npm run build
```

## First AWS deployment

Prerequisites: AWS CLI authenticated to your account, Docker, an existing VPC and public subnet, and a DNS name you control. Default region suggestion: Sydney (`ap-southeast-2`); confirm your approved hosting region. Running the stack incurs AWS charges.

1. Create an ECR repository and build the image from the checked-out commit:

```sh
export AWS_REGION=ap-southeast-2
export AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
export IMAGE_TAG="$(git rev-parse HEAD)"
export ECR_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/ps-id-registry"
aws ecr create-repository --repository-name ps-id-registry --image-tag-mutability IMMUTABLE --image-scanning-configuration scanOnPush=true
aws ecr get-login-password | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
docker build --platform linux/amd64 -t "$ECR_URI:$IMAGE_TAG" .
docker push "$ECR_URI:$IMAGE_TAG"
```

2. Deploy the infrastructure, replacing the placeholders with your actual values:

```sh
aws cloudformation deploy --stack-name ps-id-registry --template-file infra/stack.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides VpcId=vpc-REPLACE SubnetId=subnet-REPLACE \
  ImageUri="$ECR_URI:$IMAGE_TAG" DomainName=registry.example.gov.pg \
  CognitoPrefix=REPLACE-WITH-UNIQUE-PREFIX
aws cloudformation describe-stacks --stack-name ps-id-registry --query 'Stacks[0].Outputs'
```

3. Set the domain's DNS A record to the `DNSAddress` output. Caddy obtains its HTTPS certificate once DNS resolves. Check `/api/health` over HTTPS. Review bootstrap logs through Systems Manager if provisioning fails; CloudFormation instance creation alone does not certify app readiness.

4. Create each approved user in Cognito, complete email verification, and add them to the `RegistryUsers` group. Cognito requires authenticator-app MFA. Verify sign-in, sign-out, unauthorised API rejection, and one synthetic import/photo/report workflow before uploading real data.

5. Review the backups, restore process, security controls, user permissions and capacity against GPO operational requirements before production acceptance. The app retains previous source snapshots; it does not automatically merge record corrections or photo associations into a new snapshot. Review and reconcile these when replacing a source.

## Updating the running application

Build and push a new immutable image tag. Use Systems Manager Session Manager to update the container on the host: authenticate Docker to ECR, pull the new image, stop/remove the `registry` container, then recreate it using the same `/opt/registry/env`, localhost port mapping and `/opt/registry/data:/data` volume. Take an on-demand backup before upgrades. Roll back by recreating the container with the previous image if the schema remains compatible. Changing CloudFormation `ImageUri` alone does not restart an existing instance.

The included GitHub Actions workflow validates source; it does not deploy to AWS. Do not store AWS keys in Git. Add an OIDC deployment role and automated rollout only after the target AWS account and deployment policy are selected.

## Migration notes

The existing ChatGPT-hosted site remains separate and unchanged. Its runtime data and account grants are not copied. Cloudflare D1/R2 bindings are replaced by a server-side SQLite/S3 compatibility adapter. The old perimeter-authenticated service ingestion endpoint is disabled; use the authenticated, validated upload workflow. API calls verify Cognito cookies rather than trusting incoming identity headers.
