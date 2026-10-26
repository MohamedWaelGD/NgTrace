# Demo scenarios for duplicates and cancels

Status: resolved
Blocked by: 02

## What
Add to demo-app a component that fires the same GET twice, and a switchMap search that cancels.

## Acceptance
`e2e/waste.spec.ts` passes.

## Comments
2026-10-26: Implemented (packages/protocol/src/waste.ts, panel store/table/app, e2e/waste.spec.ts).
