# SevisPass PSPASS eligibility lookup

`POST /api/v1/sevispass/eligibility` performs an exact Employee Number lookup in the active payroll dataset. Use JSON with a string identifier, for example `{"employeeNumber":"000123"}`. Leading zeros and case are significant. The lookup has no side effects.

## Service access

The endpoint returns 503 until all three runtime settings are configured. Agree the exact issuer, audience and dedicated service client with the SevisPass team. Use a dedicated client configured for the client credentials grant. Use an HTTPS issuer with a JWKS endpoint and RS256 access tokens containing `iss`, `aud`, `exp`, `token_use: access`, `client_id` and scope `registry/pspass.eligibility.read`. The settings are `SEVISPASS_TOKEN_ISSUER`, `SEVISPASS_TOKEN_AUDIENCE` and `SEVISPASS_CLIENT_ID`. They are identifiers, not secrets. Never put client credentials in Git or browser code.

Send `Authorization: Bearer <service-access-token>` and `Content-Type: application/json`. Registry browser sessions do not grant service access. Missing or invalid tokens return 401. Valid tokens for a different client or lacking the dedicated scope return 403.

## Response

Synthetic example:

```json
{
  "employeeNumber": "000123",
  "decision": "pending_review",
  "registryReady": true,
  "datasetRevision": 12,
  "payrollCycle": "2026-11-06",
  "requestId": "0f577a3d-6679-4e7c-a1f3-5f8cda9b9420"
}
```

The payroll cycle is the active snapshot's recorded source date and may be null. Terminated and retired records return `ineligible`. Missing records return `not_found` with no Employee Number or readiness field. Other records return `pending_review` because issuance approval and identity matching are separate steps. `registryReady` reflects the existing registry quality rules and is never an issuance instruction. Invalid Employee Numbers return 400. Missing configuration, no active dataset or database failures return 503.

The response omits names, dates of birth, photos and payroll details. Structured logs include the request ID and response status, without Employee Numbers or tokens. Test in staging with synthetic records before enabling live access. An explicit GPO approval and SevisPass identity match are required before a future API can return `eligible`.
