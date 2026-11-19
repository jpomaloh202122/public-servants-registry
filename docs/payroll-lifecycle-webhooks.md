# Payroll lifecycle and credential notifications

The operator records the payroll period date and confirms that the source covers every agency. Older periods are rejected; a correction to the same period is allowed. The registry compares each confirmed complete payroll snapshot with the previously active dataset using exact Employee Number strings. Database migration 003 installs PostgreSQL triggers that retain missing employees, set status to Inactive, preserve their personal information and portrait references, and record payrollAbsent, missingSince, lastPayrollDataset and statusReason. Historical source datasets remain available.

Absence establishes only that the employee is not listed in the uploaded payroll period. It does not establish resignation, termination, suspension or death. GPO must confirm the actual reason. Inactive, Suspended, Terminated, Retired, Resigned and Deceased status changes request credential deactivation. The eligibility API returns ineligible for those statuses and payrollAbsent records.

The active dataset now contains current payroll employees plus retained inactive employees. The Active count reports listed active employees; Total employees includes retained people. Filter Inactive to review absences. All fields remain visible to the approved SevisPass database reader through the existing active-dataset view. A missing employee cannot be manually marked Active while payrollAbsent is true. Their return must be established by the next full source file.

## Trigger and delivery behaviour

* Activating a complete source transaction inserts retained records and compares business fields, status and stable agency identity. Import row numbers, timestamps and source-local agency IDs do not create false changes.
* A committed employee edit or agency name/code edit also queues the corresponding changes. Administrative SQL edits must follow the application's revision-update convention in the same transaction to keep cached totals and revision metadata consistent.
* Staging alone does not queue changes. Activation rollback also rolls back inserted inactive employees and notifications.
* Unchanged repeated periods do not queue duplicate changes. Retained organisation keys are based on stable content, so repeated absences do not grow their identifiers.
* New and returning officers request review. Credential reactivation and issuance require the partner's approved process.
* Two durable delivery rows are created for every event, addressed to sevispass and seviswallet. A scheduled Lambda claims pending events, signs requests and acknowledges successful HTTP 2xx responses.
* Delivery is asynchronous. The scheduler polls every minute, and network failures or backlog can increase delay. Inactive status is committed at activation; external credential deactivation is complete only when the receiving systems process it.
* Delivery is at least once. A receiver must persist the event ID and deduplicate. A timeout after processing can cause another delivery. Events for the same employee and destination are attempted in sequence. Failures remain queued with exponential backoff capped at one hour. An expired lease is reclaimable.
* A returning record never requests automatic reactivation, avoiding an older deactivation being accidentally reversed. For a review event that leaves a credential untrustworthy, the receiver should apply its agreed suspension/review policy.
* Existing credentials and existing absences are not retrospectively changed by installing the migration. The next activated full period establishes comparisons. Earlier employees absent from both the current and prior retained source cannot be recovered by this process without a separate historical reconciliation.

## Deploy from authorised CloudShell

Use the existing backend account and Sydney region, from the repository root, on Node 22 or later:

```bash
git pull --ff-only origin main
npm ci --ignore-scripts --cache /tmp/ps-id-npm-cache
AWS_REGION=ap-southeast-2 node scripts/deploy-payroll-lifecycle.mjs
```

The optional script argument is the backend stack name, default ps-id-registry-backend. It runs idempotent schema/bootstrap changes, uploads the Lambda artifact to the existing private bucket and deploys a separate backend-name-webhooks CloudFormation stack. This adds a billable Lambda, EventBridge Scheduler, Secrets Manager configuration secret and 30-day CloudWatch log group. The worker uses the restricted runtime database credential, not the owner secret. Role changes are required for the new tables. Direct employee access remains restricted.

The dispatcher uses shared account concurrency by default, avoiding reservations that small sandbox quotas cannot allocate. ReservedConcurrency can optionally be set to a positive value in the webhook stack when quota permits. Database leases, fencing tokens and receiver idempotency protect overlapping invocations. The deployment script recreates only a webhook stack in ROLLBACK_COMPLETE, after waiting for any create rollback to finish. A failed initial configuration secret may be retained by CloudFormation.

The script prints WebhookConfigurationSecret and DispatcherFunction outputs. Amplify deploys the committed application separately. Source activation fails with a migration instruction until the database trigger is installed. Confirm the Amplify release commit before testing.

## Configure the receiving systems

Obtain the actual HTTPS receiving URLs and agree which system handles wallet deactivation. Create separate random signing secrets of at least 32 characters and share each through an approved secure channel. In Secrets Manager, replace the configuration secret's value with the agreed JSON. Example structure using illustrative values:

```json
{
  "sevispass": {
    "url": "https://partner.example/registry-events",
    "signingSecret": "REPLACE_WITH_A_STRONG_SHARED_SECRET"
  },
  "seviswallet": {
    "url": "https://wallet.example/registry-events",
    "signingSecret": "REPLACE_WITH_A_DIFFERENT_SHARED_SECRET"
  }
}
```

The endpoints must be reachable from the Lambda network. Private partner endpoints require an additional approved network path. An empty configuration causes no outbound calls. An omitted destination remains queued until configured. Do not configure both destinations to perform the same action without agreeing deduplication and ownership. Do not send signing secrets in chat or commit them to Git.

The POST request carries these headers:

* X-Registry-Event-Id identifies the durable event.
* X-Registry-Timestamp is Unix time in seconds.
* X-Registry-Signature is sha256= followed by lowercase HMAC-SHA256 hexadecimal over timestamp + "." + the exact raw request body.

The receiver must check the HMAC using constant-time comparison, reject timestamps outside the agreed replay window (for example five minutes), deduplicate event IDs durably and verify that a credential belongs to the exact Employee Number. Return 2xx only after durable acceptance. Persist the highest processed sequence per employee, ignore older events and retain the credential lifecycle audit. Backfill and reconciliation of credential inventory require a separately approved process.

Example body with synthetic identifiers:

```json
{
  "id": "opaque-event-id",
  "type": "employee.changed",
  "schemaVersion": 1,
  "sequence": 101,
  "employeeNumber": "000123",
  "datasetRevision": 42,
  "datasetId": "snapshot-id",
  "occurredAt": "2026-11-19T12:00:00Z",
  "changedFields": ["payrollPresent", "status"],
  "credentialAction": "deactivate",
  "reason": "absent_from_payroll",
  "previous": {
    "status": "Active",
    "payrollPresent": true,
    "agency": {"code": "001", "name": "Example Agency"},
    "position": "Officer"
  },
  "current": {
    "status": "Inactive",
    "payrollPresent": false,
    "agency": {"code": "001", "name": "Example Agency"},
    "position": "Officer"
  }
}
```

Other changed fields use credentialAction review unless the current status requires deactivation. Webhook summaries omit names, DOB, portrait bytes and other full record fields. The partner can query the approved database view for complete current details after establishing its private database connection.

## Acceptance and operations

Use synthetic staging records to establish a baseline, activate a full period with one missing employee and a transfer, and verify Inactive status, retained portrait and queued events. Check independent delivery to both recipients, signature validation, response failures, retries, same-employee ordering, duplicate acknowledgement and return-to-payroll review.

Payroll cycle changes shows pending, retrying and last-acknowledged delivery information. Database tables registry_change_events and registry_webhook_deliveries hold the durable audit and delivery state. Monitor Lambda Errors, Throttles and Duration plus backlog and retry counts. Set operational alert ownership before enabling live credential actions. Keep source uploads complete across all agencies; an agency-only extract must not be activated as a whole-registry payroll period.

Revoke a destination by removing its configuration entry; pending events remain durable. Restoring configuration resumes them. To pause all dispatch, disable the Scheduler schedule. Failed or uncertain partner actions require reconciliation of event IDs with credential state before replay. No routine process deletes employee rows.

## Sources

PostgreSQL trigger transactions
https://www.postgresql.org/docs/16/trigger-definition.html

AWS Lambda with EventBridge Scheduler
https://docs.aws.amazon.com/lambda/latest/dg/with-eventbridge-scheduler.html
