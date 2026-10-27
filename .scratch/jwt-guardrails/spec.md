# JWT guardrails — spec

Terms: `GLOSSARY.md` (Token, Captured Request, Quick-copy Header). `docs/ideas.md` #14. Build order: 1 of 3 (then `export-code`, `contract-schema`).

## Scope
- **Detection**: find Tokens in the selected Captured Request, request and response side: header values (including `Bearer <jwt>`), cookies (`Cookie` split on `;`, one Token per `Set-Cookie` header), query string values, and string values anywhere inside JSON bodies (e.g. `access_token`). Only well-formed three-part base64url JWTs whose header and payload decode as JSON count.
- **Tokens tab** in the request drawer, with a count badge, disabled when none are found. Each entry shows where it was found (`Authorization` header, `?token=`, `Set-Cookie: session`, `response.access_token`), the decoded header, the decoded claims, and `exp` / `iat` / `nbf` rendered as dates.
- **`exp` countdown**: live ("expires in 4m 12s" / "expired 3h ago"), highlighted when under 60 s. Also shows whether the Token was already expired when the request was sent.
- Labelled "decoded, signature not verified". The signature is never checked.
- **Masking**: a Token found in a masked header or cookie decodes only once that value is visible (Unmasked toggle or click-to-reveal). Tokens in query strings and bodies are never masked, so they decode immediately. No change to what is masked.
- Complements Quick-copy Headers; does not change them.

## Out of scope
- Signature verification, JWE/opaque tokens, decoding anything but JWTs, new settings.
