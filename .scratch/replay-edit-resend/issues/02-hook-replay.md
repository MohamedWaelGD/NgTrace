# Hook replay command

Status: resolved
Blocked by: none

## What
`PanelCommand { type: 'replay' }`. The hook uses the native fetch saved in capture.ts and records the new request with `replayOf`. Masked headers are sent raw.

## Acceptance
Unit test in the capture.test.ts style; e2e shows a new row linked to the original.

## Comments
2026-10-26: Implemented (diff.ts, replay.ts, capture.ts replay, request-replay.ts, e2e/replay.spec.ts).
