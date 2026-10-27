# Postman collection export

Status: resolved
Blocked by: 01

## What
Add `toPostman(requests, mask)` to `export.ts` (v2.1, folders by Owner Component, "Unattributed" folder) and "Postman (masked)" / "Postman (unmasked)" entries in the Export menu.

## Acceptance
Unit tests: folder grouping, order, headers/body/query mapping for json, text, form and no body, masking. e2e downloads a collection that parses.

## Comments

2026-10-27: Implemented (packages/protocol/src/export.ts, panel Export/Copy menus, e2e/export-code.spec.ts).
