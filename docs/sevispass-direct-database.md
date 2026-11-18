# SevisPass direct database access

The dedicated login is sevispass_reader. The sevispass.employees view exposes every stored employee payload field, organisation details, payroll source metadata, effective employment status and the current dataset revision. It follows the active dataset automatically. It includes unverified and inactive employees for review. The consumer must apply the registry rules and issuance approval before creating credentials.

The employee column is JSONB and preserves fields without a lossy fixed-column mapping. Example lookup with a bound string parameter:

```sql
SELECT employee_number, employee, organisation,
       effective_employment_status, dataset_revision
FROM sevispass.employees
WHERE employee_number = $1;
```

Keep leading zeros in Employee Number. The stored ready column is deliberately omitted because it can become stale as age changes. A photo field contains an S3 object reference. Database access alone does not retrieve the image bytes. Agree separate scoped S3 read access for portraits if required.

## Provision from authorised AWS CloudShell

From a current repository checkout, with AWS CLI and Node available:

```bash
git pull --ff-only origin main
AWS_REGION=ap-southeast-2 node scripts/setup-sevispass-db-reader.mjs
```

The optional script argument selects the backend stack and defaults to ps-id-registry-backend. It checks the approved account, discovers the cluster, creates or reuses a Secrets Manager credential and configures the role and view in one database transaction through the existing Data API. It prints the actual private endpoint, port, database, username and secret ARN. It never prints the password. Retrieve that secret only through authorised AWS access and deliver it through the approved secret-sharing channel. Rerunning reuses the credential and reapplies grants. Manual secret replacement must be followed by this setup script to synchronise the database password.

The role has SELECT permission only on the view, no membership in other roles, no base-table permissions and a default read-only transaction setting. PostgreSQL PUBLIC grants or later administrator grants can widen permissions, so review these before handover. This is an explicit deployment step and is not automatically run by Amplify.

## Network connection

The Aurora writer is private and the existing security group has no inbound rules. The SevisPass team must provide its AWS VPC/security group or private routed source CIDR and the agreed VPN/peering path. Add a narrowly scoped TCP 5432 rule through the infrastructure change process after confirming the route and DNS resolution. This script does not provision network changes.

Configure the PostgreSQL client with sslmode=verify-full and the current AWS RDS CA bundle. Use a password prompt or the client's secure secret integration. Do not put the password into shell history, a repository or a connection URL in chat.

## Handover validation

From the SevisPass network, verify a TLS connection as sevispass_reader, exact Employee Number lookup, full payload fields and active dataset switching with synthetic records. Confirm SELECT on public.employees is denied and UPDATE/DELETE/INSERT on the view fail. Run permission probes in rolled-back transactions or a synthetic staging database. Confirm CREATE TABLE in public and role escalation are denied. Save the result without employee data or credentials.

To revoke access, an administrator can ALTER ROLE sevispass_reader NOLOGIN and terminate its existing sessions, then remove the dedicated network rule. Record who owns secret rotation and periodic access review.
