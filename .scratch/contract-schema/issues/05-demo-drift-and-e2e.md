# Demo drifting endpoint and e2e

Status: needs-triage
Blocked by: 04

## What
Add to demo-app an endpoint whose response changes shape across calls (type change, missing field, null) plus a `/items/:id` pair for templating. Add `e2e/contract.spec.ts`.

## Acceptance
Spec covers: Endpoint grouping across ids, Drift entries and links, Copy as TypeScript output, skipped truncated body.
