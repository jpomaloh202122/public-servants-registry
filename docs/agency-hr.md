# Agency HR and registry administration

The main administrator opens **Registry administration** from the registry navigation. Select an existing account or invite an officer by email, then assign one agency code and one HR role. Assign existing HR staff before giving them registry access. Unassigned legacy RegistryUsers retain their existing central access. New agency users do not need Cognito group membership.

Agency HR Managers can search and view staff in their department. Agency HR Officers can also correct names, gender, date of birth and position, and upload a passport-style portrait. A correction returns the record to verification. Employee numbers, departmental transfers, payroll status and issuance are controlled separately. An absent or ambiguous agency code blocks access until the assignment is corrected.

Use **Agency roles** to create, edit or delete custom roles. Reassign users before deleting a role. The main administrator account is protected from changes in the directory. On the issued ID panel, select an exact employee number and provide a reason. Suspension can be lifted. Revocation invalidates the card. Deletion removes the issued card record and leaves an administrator audit event.

## Activate on Amplify

The production registry setup includes the nominated administrator's Cognito sub. For a different deployment or an administrator change, set REGISTRY_MAIN_ADMIN_SUB to the selected account's sub from that registry pool. The account must be enabled with a verified email. Use the existing scripts/deploy-amplify-backend.sh release workflow with the current stack, APP_URL and AMPLIFY_APP_ID. It applies the Cognito IAM permissions, runs the PostgreSQL migration and persists the validated administrator ID on the branch before starting Amplify. Merging frontend code alone does not activate these AWS settings.
