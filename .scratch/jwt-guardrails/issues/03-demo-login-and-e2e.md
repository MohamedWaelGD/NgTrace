# Demo login endpoint and e2e

Status: resolved
Blocked by: 02

## What
Add to demo-app a login call that returns a short-lived JWT in the body, then sends it as `Authorization: Bearer`, plus one call with the token in the query string and one with an already-expired token. Add `e2e/tokens.spec.ts`.

## Acceptance
Spec covers: tab badge count, decoded claims, countdown, expired-at-send marker, masked-header Token hidden until revealed, query/body Tokens decoded immediately.

## Comments

2026-10-27: Implemented (packages/protocol/src/jwt.ts, request-detail Tokens tab, demo-app auth component, e2e/tokens.spec.ts).
