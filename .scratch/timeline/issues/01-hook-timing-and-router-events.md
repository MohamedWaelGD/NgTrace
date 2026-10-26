# Monotonic start time and router event log

Status: resolved
Blocked by: none

## What
Add `startMono` to CapturedRequest and a bounded `NavEvent` list in the hook, with a new `navigation` HookMessage and a snapshot field.

## Acceptance
Unit test for the bounded event log; e2e sees navigation events after a route change.

## Comments
2026-10-26: Implemented (nav-log.ts, timeline.ts, request-timeline.ts, e2e/timeline.spec.ts).
