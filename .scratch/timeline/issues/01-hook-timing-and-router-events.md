# Monotonic start time and router event log

Status: ready-for-agent
Blocked by: none

## What
Add `startMono` to CapturedRequest and a bounded `NavEvent` list in the hook, with a new `navigation` HookMessage and a snapshot field.

## Acceptance
Unit test for the bounded event log; e2e sees navigation events after a route change.

## Comments
