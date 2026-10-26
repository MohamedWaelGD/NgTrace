# Hook replay command

Status: ready-for-agent
Blocked by: none

## What
`PanelCommand { type: 'replay' }`. The hook uses the native fetch saved in capture.ts and records the new request with `replayOf`. Masked headers are sent raw.

## Acceptance
Unit test in the capture.test.ts style; e2e shows a new row linked to the original.

## Comments
