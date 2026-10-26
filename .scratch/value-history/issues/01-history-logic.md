# Pure Value History buffer

Status: resolved
Blocked by: none

## What
`packages/protocol/src/history.ts`: a capped buffer that applies `LiveUpdate`s into snapshots (top level + expanded paths, signals when present), with `at(index)`, `changedAt(index)`, and `before(time)` for "the snapshot just before this request". Times use the monotonic clock shared with `startMono`.

## Acceptance
Unit tests: the cap at 200 drops the oldest; `before(t)` picks the last snapshot earlier than t; changed paths per step; clearing on target change.

## Comments
2026-10-26: Implemented (protocol history.ts ValueHistory: capped at 200, at/changedAt/before/times, clear on target change; LiveUpdate.at stamped by the hook with the startMono clock).
