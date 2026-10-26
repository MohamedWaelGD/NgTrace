# Pure waste detection over Captured Requests

Status: resolved
Blocked by: none

## What
Add `packages/protocol/src/waste.ts`: `detectWaste(requests, windowMs)` returns a map of request id to Waste Signals, and `summariseWaste` groups them by Owner Component (class name, or the Unattributed group).

## Acceptance
Unit tests: duplicate within window and while in flight; outside window not flagged; POST never flagged; query order ignored; abort-then-refire flagged; counts per group.

## Comments
2026-10-26: Implemented (packages/protocol/src/waste.ts, panel store/table/app, e2e/waste.spec.ts).
