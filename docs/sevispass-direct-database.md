# SevisPass direct database access

The dedicated login `sevispass_reader` can look up employees in the current dataset through `sevispass.employees`. A matching row can include an inactive or unverified employee. Use the separate eligibility workflow for credential decisions.

```sql
SELECT employee_number, first_name, last_name, gender, date_of_birth, position, department_name
FROM sevispass.employees
WHERE employee_number = $1;
```

All seven columns are text. Bind the employee number as a string to preserve leading zeros. Date of birth carries the recorded value, with an empty or missing value returned as NULL. The department name comes from the organisation matched within the same dataset. Consumers of the earlier JSON projection need to switch to the named columns when this update is applied.

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

From the SevisPass network, verify a TLS connection as sevispass_reader, exact Employee Number lookup, the seven named fields and active dataset switching with synthetic records. Confirm SELECT on public.employees is denied and UPDATE/DELETE/INSERT on the view fail. Run permission probes in rolled-back transactions or a synthetic staging database. Confirm CREATE TABLE in public and role escalation are denied. Save the result without employee data or credentials.

To revoke access, an administrator can ALTER ROLE sevispass_reader NOLOGIN and terminate its existing sessions, then remove the dedicated network rule. Record who owns secret rotation and periodic access review.
