# Pure rule matching

Status: resolved
Blocked by: none

## What
`packages/protocol/src/mock.ts`: rule types and `matchRule(rules, req)` (glob or regex, method, component class, first match, disabled rules skipped).

## Acceptance
Unit tests for each matching dimension and for ordering.

## Comments
2026-10-26: Implemented (mock.ts, mock-engine.ts, capture.ts fetch+XHR, mocks-pane.ts, e2e/mocking.spec.ts).
