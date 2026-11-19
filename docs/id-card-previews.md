# Public Servant digital IDs

The supplied landscape template is used for the on-screen card and a one-page 86 × 54 mm PDF. It prints full name, department, position, gender and exact Employee Number, plus the GPO watermark and a working verification QR. No portrait is printed in this template. The saved portrait is shown separately as private review evidence. Leading zeros are retained.

Every employee row has a card button. Ineligible records display their blocking checks, with a link back to the employee editor. Uploading a photo alone does not verify the photo, approve the record or issue a card. Existing readiness rules still apply: active payroll, no absence flag, required fields, DOB and age checks, verified saved portrait, no source conflicts, and a complete agency reference. S3 is checked for the portrait's existence.

GET /api/id-card?employeeNumber=000123 requires an authorised RegistryUsers session. It returns either a PREVIEW, the current valid ISSUED card, or a specific error and readiness checks. Status codes are 401/400/404/409/503 for missing session/invalid identifier/not found/readiness or snapshot conflict/backend unavailable. Responses are private and no-store.

Approve and issue ID requires an explicit confirmation by the signed-in staff member. POST /api/id-card accepts employeeNumber, datasetId, revision and confirmIssue:true. Issuance rechecks readiness and uses an atomic registry revision lock, replacement update, persisted card and audit event. A repeated request reuses an already committed current card. A later replacement marks the previous card superseded. Existing RegistryUsers are the authorised issuers in this implementation; there is no separate issuer group.

The QR contains a 256-bit random token, never an employee-number lookup. /verify/<token> and GET /api/id-card/verify?token=... are public, no-store and excluded from indexing. A valid token reveals only the five printed fields. Inactive, changed, superseded, revoked and unknown results reveal no employee details or private HR reason. Holders should treat the QR as shareable access to those five fields. The preview QR opens a generic preview result and cannot verify an officer.

Verification checks the current active dataset, readiness, portrait availability, identity fingerprint and per-employee lifecycle event sequence. A payroll absence, changed identity field or other tracked lifecycle event invalidates the old card. Returning to payroll does not automatically reactivate it: staff review and reissue. Explicit revocation state is supported by the storage/verification layer; an administrative revocation UI is not included. PDF downloads recheck dataset/revision/card ID before saving. An offline PDF cannot by itself prove that a credential is currently valid: scan the QR online.

These are registry-issued digital ID cards. Signed SevisPass credentials in SevisWallet remain a separate partner issuance and delivery integration. Existing payroll webhooks continue to notify configured partners; registry card issuance does not imply wallet delivery.

## Deployment

Apply migration 004 and runtime grants with `AWS_REGION=ap-southeast-2 node scripts/setup-issued-cards.mjs` from an updated repository with the two bootstrap SDK dependencies installed. It discovers the existing stack outputs, runs idempotent migrations and grants access to registry_app. It creates no AWS service or employee approval. The SevisPass read-only view user receives no access to card tokens. Release the application through Amplify main. Without migration 004, previews still work and issuance is disabled.

For a disk-constrained CloudShell, run `bash scripts/setup-issued-cards.sh` from an updated checkout. It archives the committed source into /tmp, installs only the two bootstrap SDK dependencies, applies setup and runs the readiness diagnostic. Temporary source/dependencies are removed on exit. The full app install is not necessary.

`AWS_REGION=ap-southeast-2 node scripts/check-id-card-readiness.mjs` is a read-only, dependency-free diagnostic for Jessy Sekere and Joshua Pomaloh. Other exact full names may be supplied as separate arguments. It prints identifiers and checks, not DOB, photo bytes, tokens or passwords. Multiple name matches are not guessed. Latest issuance state alone is not proof of current validity; the live verification result performs that check.

Run npm run test:id-cards, npm run typecheck and the production build. The tests exercise real PostgreSQL migrations using PGlite, authenticated lookup, detailed readiness failures, approval, transaction rollback, idempotency, QR decoding, public field limits, payroll changes, return-to-payroll invalidation, replacement, revocation, Unicode and PDF layout bounds. Test staff-only preview, issuing and scanning with a synthetic officer after deployment before issuing real IDs.
