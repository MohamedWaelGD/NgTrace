# Demo drifting endpoint and e2e

Status: resolved
Blocked by: 04

## What
Add to demo-app an endpoint whose response changes shape across calls (type change, missing field, null) plus a `/items/:id` pair for templating. Add `e2e/contract.spec.ts`.

## Acceptance
Spec covers: Endpoint grouping across ids, Drift entries and links, Copy as TypeScript output, skipped truncated body.

## Comments

2026-10-27: Implemented (packages/protocol/src/contract.ts, panel request-contract.ts, demo-app contract component, e2e/contract.spec.ts).
