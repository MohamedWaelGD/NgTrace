# Contract tab in the drawer

Status: resolved
Blocked by: 03

## What
Add the Contract tab: shape tree, Drift list linking to disagreeing requests (selects them), skipped-body notes, "Copy as TypeScript" button.

## Acceptance
Panel behaviour matches the spec; the tab shows "No JSON body" for non-JSON responses.

## Comments

2026-10-27: Implemented (packages/protocol/src/contract.ts, panel request-contract.ts, demo-app contract component, e2e/contract.spec.ts).
