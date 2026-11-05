# Public Servants Registry

Next.js + TypeScript foundation for the Government Payroll Office. Purpose: clean and verify public servant data before a controlled SevisPass integration.

## Current release

- Responsive dashboard, name/payroll search, agency and quality filters.
- Synthetic data only; **no authentication, live uploads, shared persistence or SevisPass connection yet**.
- Tested data-quality rules: calendar-valid DOB, age review range 18–65, agency reference, duplicate payroll number, required identifiers, identity/photo verification and approval gate.
- PostgreSQL migration for batches, source records, canonical servants, corrections, review decisions, audit and integration outbox.
- AWS CloudFormation data foundation and Amplify build configuration.

## Run

Node.js 22 or later. `npm ci`, `npm test`, `npm run dev`. Production check: `npm run build`.

Sample agency codes are fictional. The age range is a review rule and must be confirmed against applicable employment categories. Eligibility displayed by the prototype is illustrative, not an identity assurance decision.

## AWS target

Next.js on Amplify Hosting → authenticated API Gateway → Lambda in VPC → private RDS PostgreSQL. Cognito invite-only accounts with TOTP MFA; private versioned S3 source documents; SQS import jobs; Secrets Manager; CloudWatch and CloudTrail. Dev, test and production must use separate stacks/accounts and datasets. Proposed region: ap-southeast-2, pending DPM/DICT hosting and data residency decision.

`infra/foundation.yaml` provisions VPC, isolated data subnets, encrypted RDS, private S3 and Cognito groups. It does **not** provision the frontend, APIs, workers or integration. Template deployment incurs AWS charges. It has not been deployed or AWS-validated in this session. See `docs/IMPLEMENTATION.md` for remaining work and release gates.

No production credentials, payroll records or personal photographs belong in Git. No live data may be placed in this prototype until server-side authentication, agency authorization and audit flows are complete.
