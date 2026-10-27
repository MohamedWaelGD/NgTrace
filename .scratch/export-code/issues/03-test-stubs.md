# Playwright and Cypress stubs

Status: needs-triage
Blocked by: 01

## What
Add `toPlaywrightStub` and `toCypressStub` to `export.ts`: one route per method + exact URL with the latest response, Owner Component comment, truncated-body comment. Copy menu entries for the selected request, Export menu entries (masked / unmasked) for the visible set.

## Acceptance
Unit tests: de-duplication keeps the latest, escaping of quotes/backticks in bodies, JSON vs text vs binary bodies, masking. e2e copies a stub for the selected request.
