# Badges, wasteful filter and summary

Status: resolved
Blocked by: 01

## What
The store computes waste signals from `requests`. Row badge, "Wasteful only" chip, a summary list from the toolbar, and `duplicateWindowMs` in Settings and the options page.

## Acceptance
e2e: the demo duplicate scenario shows a Duplicate badge and the summary lists its component.

## Comments
2026-10-26: Implemented (packages/protocol/src/waste.ts, panel store/table/app, e2e/waste.spec.ts).
