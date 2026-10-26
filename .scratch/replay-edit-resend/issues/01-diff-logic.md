# Response diff

Status: resolved
Blocked by: none

## What
`packages/protocol/src/diff.ts`: `diffResponses(a, b)` returns status and header changes plus a JSON structural or line diff.

## Acceptance
Unit tests: changed, added and removed JSON paths; header changes; text line diff.

## Comments
2026-10-26: Implemented (diff.ts, replay.ts, capture.ts replay, request-replay.ts, e2e/replay.spec.ts).
