# Response diff

Status: ready-for-agent
Blocked by: none

## What
`packages/protocol/src/diff.ts`: `diffResponses(a, b)` returns status and header changes plus a JSON structural or line diff.

## Acceptance
Unit tests: changed, added and removed JSON paths; header changes; text line diff.

## Comments
