# Scrubber, request markers and history bar

Status: resolved
Blocked by: 01

## What
The store keeps the history for the followed target (frozen while paused). Details pane: scrubber with request markers, the values at the scrubbed step with changes highlighted, and the "Viewing history · Back to live" bar. Selecting an owned request jumps to the snapshot before it.

## Acceptance
e2e: change a demo value, fire a request, scrub to the marker and see the value before the change; "Back to live" returns to the current values.

## Comments
2026-10-26: Implemented (store history per Live Values target, frozen while paused; viewDetails/viewExpansions/viewFlashing; history-scrubber.ts with request markers and 'Viewing history · Back to live' bar; selecting an owned request jumps to the snapshot before it; e2e/value-history.spec.ts).
