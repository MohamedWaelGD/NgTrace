# Pure JWT detection and decoding

Status: resolved
Blocked by: none

## What
Add `packages/protocol/src/jwt.ts`: `findTokens(request)` returns the Tokens in a Captured Request with their location label, decoded header and claims; `expiryState(token, now)` returns remaining/elapsed time and whether it is under the 60 s warning threshold; `expiredAtSend(token, request)`.

## Acceptance
Unit tests: Bearer header; bare header value; `Cookie` with several cookies; `Set-Cookie`; query parameter; nested JSON body string; malformed or two-part strings ignored; non-JSON payload ignored; base64url padding and `-`/`_`; missing `exp`; exp in past, future and under 60 s; expired-at-send.

## Comments

2026-10-27: Implemented (packages/protocol/src/jwt.ts, request-detail Tokens tab, demo-app auth component, e2e/tokens.spec.ts).
