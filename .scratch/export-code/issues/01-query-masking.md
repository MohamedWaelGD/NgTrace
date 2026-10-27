# Mask matching query parameters in masked exports

Status: resolved
Blocked by: none

## What
Extend the masker with query-parameter masking by name (same pattern as header names). Apply to `toCurl`, `toFetch` and `toHar` when masked. Update the options page wording and README (bodies are exported as captured).

## Acceptance
Unit tests in `export.test.ts`: `?access_token=x&page=2` masks only the token value, unmasked mode untouched, URL still valid in cURL/fetch/HAR.

## Comments

2026-10-27: Implemented (packages/protocol/src/export.ts, panel Export/Copy menus, e2e/export-code.spec.ts).
