# Public Servants Registry — PS ID

Next.js Government Payroll Office registry. Preserves the established screens, imports, agency search, photos, quality checks and management reports. No live payroll data is included.

## Current Amplify backend

- **Login:** Amazon Cognito authorisation-code flow with PKCE, nonce verification, required authenticator-app MFA, verified email and the administrator-assigned `RegistryUsers` group.
- **Database:** shared Aurora PostgreSQL through the HTTPS RDS Data API. Production never falls back to browser or local SQLite storage.
- **Photos and source files:** private, encrypted, versioned S3. Photographs are served only after login. Original sources upload directly to S3 using five-minute signed URLs; downloads use one-minute signed URLs. New source archives retain their S3 version ID.
- **Credentials:** Amplify SSR compute role and Secrets Manager. Runtime uses a restricted database user with table permissions; schema setup uses a separate owner credential. AWS keys and database passwords are not added to Amplify environment variables.
- **History:** prior source snapshots remain in PostgreSQL and S3. Employee edits and their revision update commit in one transaction, with complete new employee edit events in `audit_events`. The dashboard holds the latest 100 events to keep metadata small.

All approved RegistryUsers members currently have registry-wide read/write access. Agency-specific roles and a user-management screen are a later change. New source snapshots still require reconciliation of previous corrections and photo associations; they are not automatically merged across uploads. Session tokens expire after one hour; users then sign in again.

## Deploy the backend in SevisPNGSandbox

The working Amplify app and branch must already exist in Sydney (`ap-southeast-2`). The deployment script requires AWS CLI, Node.js 22+, Python 3 and a checkout of this private GitHub repository. Use authenticated GitHub access or upload the source archive through CloudShell; never paste access tokens into chat.

**This creates billable Aurora Serverless v2 resources, configured at 0.5–2 ACUs, plus S3 and Cognito.** It creates a separate backend stack, with no EC2 instance or NAT gateway. The database is in isolated subnets with no inbound database port. Seven days of database backups and deletion protection are enabled. Snapshots/source archives require retention and restore testing before production approval.

From the repository root in your authenticated AWS CloudShell session:

```sh
export AWS_REGION=ap-southeast-2
export AMPLIFY_APP_ID=dREPLACE
export APP_URL=https://main.dREPLACE.amplifyapp.com
export AMPLIFY_BRANCH=main
npm ci --ignore-scripts
bash scripts/deploy-amplify-backend.sh
```

Replace both placeholders with the actual Amplify app ID and exact HTTPS origin; do not include a trailing slash. The script checks account **440660366630**, chooses an available Aurora PostgreSQL 16 version, creates `ps-id-registry-backend`, initializes the schema and restricted runtime user, attaches the backend role to the chosen Amplify branch, preserves existing branch environment variables, and starts a deployment. It does not create or invite users.

CloudFormation creation usually takes several minutes. If a step fails, review that error before rerunning. The database schema and user bootstrap are idempotent; the stack has deletion protection. Do not deploy the old `infra/stack.yaml` EC2 template for this Amplify app.

### If the AWS environment restricts resource creation

The CloudShell identity needs permission to create/update CloudFormation, Cognito, S3, Secrets Manager, IAM roles, VPC/subnets and Aurora, to pass the compute role, read the owner/application secrets during bootstrap, run RDS Data API statements, and update the Amplify app/branch. Ask the account administrator for a deployment role when organisational policies block these operations. Runtime permissions remain restricted to this app's bucket, cluster and application secret.

### Approve the first login

In Cognito, open the pool identified by the backend stack's `USER_POOL_ID` output. Create the authorised user with their email, complete the email verification process, and add that user to **RegistryUsers**. The account must have a verified email and group assignment; signing in alone grants no registry access. Use Cognito's secure invitation/temporary-password flow and authenticator enrolment; do not place passwords in Git or chat.

Test at the exact Amplify URL configured in `APP_URL`. Password reset is handled by Cognito; users can use the hosted sign-in recovery flow. The UI does not store a separate password database.

### Acceptance checks before real records

1. Open `/login`, sign in, enrol MFA, and verify sign-out. An unapproved account must be rejected.
2. After sign-in, visit `/api/system`. Database should report `connected` and configuration flags should be true.
3. Import a small synthetic CSV; activate it. Sign in from another browser/device and verify the same records appear.
4. Upload a synthetic PNG/JPEG photo (up to 3 MB); save the employee and verify it appears on the second device. A new private browser without login must not retrieve `/api/photo?key=...` or registry/source-summary APIs.
5. Confirm original-source download, PDF/Excel/CSV reports, a conflicting edit, and snapshot history.
6. Restore a test database backup and inspect S3 version recovery before production acceptance.

Live AWS sign-in, IAM, S3 CORS and database access must be verified after deployment. Local tests do not establish that resources exist or are accessible. Large reports may exceed Amplify response limits; scope reports by agency until asynchronous exports are implemented.

## Development and validation

```sh
npm ci
cp .env.example .env.local
npm run dev
npm run typecheck
npm run test:photos
npm run test:identity
npm run test:postgres
npm run test:data-api
npm run test:quality
npm run test:imports
npm run test:reports
npm run test:runtime
npm run build
```

Use the backend stack outputs to configure `.env.local`. Cognito cookies require HTTPS. Tests use synthetic fixtures: PostgreSQL queries execute in PGlite, Data API transport is mocked, and the legacy SQLite adapter runs only when explicitly selected for development/testing. There is no authentication bypass.

`amplify.yml` sets up a Next.js SSR build with `.next` artifacts. `scripts/amplify-env.mjs` forwards an explicit allowlist of public configuration and resource references into the SSR runtime, excluding credentials. The GitHub workflow validates the source; the connected Amplify branch deploys app commits. Infrastructure deployment is a separate explicit operation.

## Reference

- [Amplify SSR compute roles](https://docs.aws.amazon.com/amplify/latest/userguide/amplify-SSR-compute-role.html)
- [Amplify SSR environment configuration](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-environment-variables.html)
- [RDS Data API](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html)

SevisPass integration, high availability, capacity/load testing, agency permissions and production hardening remain separate implementation work.
