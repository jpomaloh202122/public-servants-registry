# Implementation and release plan

## Data workflow

1. Authorized officer uploads CSV/XLSX through an authenticated, short-lived S3 upload URL. Enforce file size/type, checksum, malware inspection and import limits.
2. Worker stages every original row against a batch, maps fields and runs versioned rules. Preserve original values; never silently discard malformed rows or overwrite prior snapshots.
3. Compare each fortnightly batch with the prior approved batch by stable payroll identifier. Track new, changed, unchanged and absent records; absence must not automatically deactivate a person.
4. Agency-scoped officers propose corrections. A different reviewer vets/approves them. Apply approved corrections transactionally using record versions; append audit history and re-run checks.
5. A separate identity assurance workflow records evidence and verification. Active payroll plus a photograph does not constitute identity proofing.
6. Only an explicitly approved, currently eligible record may enter the SevisPass outbox. The worker must recheck eligibility on delivery and use idempotency keys. No integration is implemented yet.

## Next increments

- Cognito login/logout, secure sessions, token verification and invite lifecycle. Server-side agency assignments on every list, detail, upload, correction and export request. Deny by default.
- API Gateway/Lambda, least-privilege runtime role and DB user, Secrets Manager endpoint, S3 gateway endpoint, migration runner, PostgreSQL TLS and connection management. The current isolated subnets have no internet egress.
- CSV/XLSX uploads, SQS worker/DLQ, field mapping, batch comparison and persisted quality results. Shared state belongs in RDS/S3, never localStorage.
- Agency assignment and correction UI, reviewer separation, audit feed and management/agency exports with spreadsheet-formula injection protection.
- Agree SevisPass API schema, trust/assurance requirements, consent/legal basis, authentication, revocation and reconciliation with the SevisPass team. No invented endpoints or automatic credential issuance.
- Infrastructure additions: Amplify app connection, API/worker stacks, alerting, WAF, CloudTrail, backup/restore drills, key/retention policies and production budgets.

## Deployment

First review account, region, CIDRs and costs. Use a dedicated AWS role and CloudFormation change sets; do not place access keys in GitHub. Deploy foundation separately per environment. Apply database migration from a controlled VPC-connected runner. The runtime DB user must not be database owner or superuser; revoke audit mutation/DDL permissions. Add server-side eligibility and approval enforcement in transactions before any write or integration route is exposed.

Connect Amplify to the approved GitHub branch only after authentication is implemented; keep synthetic data in preview builds. Add GitHub OIDC with environment-specific roles and approval for production deployment. CI currently tests and builds only; it never deploys.

## Acceptance before real data

Verify cross-device persistence, access isolation between agencies, expired/revoked session handling, import idempotency, bad dates and duplicate batches, independent approvals, concurrent corrections, immutable audit access, approved-record-only integration and recoverability. Review policy for age exceptions and official agency reference data. Obtain security review and hosting approval before live payroll uploads.

## Sources

- https://nextjs.org/docs/app/getting-started/installation
- https://docs.aws.amazon.com/amplify/latest/userguide/deploy-nextjs-app.html
- https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html
