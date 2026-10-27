# Tokens tab in the drawer

Status: resolved
Blocked by: 01

## What
Add the Tokens tab (count badge, disabled when empty) listing each Token with location, decoded header and claims, date-rendered time claims and a live `exp` countdown. Tokens in masked headers/cookies stay hidden until Unmasked or click-to-reveal. Label: "decoded, signature not verified".

## Acceptance
Panel behaviour matches the spec; the countdown ticks without leaking timers when the drawer closes or another request is selected.

## Comments

2026-10-27: Implemented (packages/protocol/src/jwt.ts, request-detail Tokens tab, demo-app auth component, e2e/tokens.spec.ts).
