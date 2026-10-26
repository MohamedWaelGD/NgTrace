# Edit & resend UI and diff tab

Status: resolved
Blocked by: 01, 02

## What
Editor, confirmation for side-effecting methods, disabled-state reasons, diff tab. Replay rows are grouped under their original and excluded from waste detection.

## Acceptance
e2e: edit a header, resend, see the diff and the replay row.

## Comments
2026-10-26: Implemented (diff.ts, replay.ts, capture.ts replay, request-replay.ts, e2e/replay.spec.ts).
