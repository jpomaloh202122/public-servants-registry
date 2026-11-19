# Public Servant digital ID card previews

An authorised RegistryUsers member can open Ready for SevisPass review from Overview, then use the card icon beside an eligible employee in the register. The preview displays the official GPO emblem, verified portrait, name, exact Employee Number, agency code, agency name and position. Download preview PDF creates front and back pages at 86 × 54 mm.

The source period, registry revision and readiness assessment date appear on the reverse. The PDF embeds fonts for names with supported Unicode characters. Layout errors such as exceptionally long fields produce an error rather than silently cropping text in the downloaded file. The on-screen design is illustrative; the PDF contains the physical card layout.

GET /api/id-card?employeeNumber=000123 requires the existing staff session. It performs an exact lookup in the active dataset, applies the registry readiness rules and requires a resolved agency and a portrait reference. Inactive, absent, suspended, unverified, incomplete and conflicting records cannot produce a card preview. The endpoint returns private no-store JSON with the minimum display fields. It returns 401 for missing staff access, 400 for an invalid identifier, 404 for an unknown officer, 409 for failed readiness or a changed snapshot, and 503 for a registry connection failure.

The download flow rechecks the saved record, retrieves the protected photo, prepares the PDF and checks the dataset and revision once more before saving. All generated cards are visibly labelled PREVIEW and AWAITING ISSUANCE APPROVAL. Generating or downloading a preview has no issuance side effect.

Authorised approval, credential identifiers and signed SevisPass issuance into SevisWallet remain part of the partner integration. A PDF represents the registry data at preparation time. Credential lifecycle changes are handled through the existing signed webhook workflow after the receiving systems are configured. The preview has no public verification endpoint or QR verification claim.

The application change requires the usual Amplify release from main. It introduces no database migration. Validate with a ready synthetic officer and a rejected unverified/inactive officer after deployment. Test leading zeros, source changes during preparation, a missing portrait and download access after sign-out. Run npm run test:id-cards for the local fixture checks.
