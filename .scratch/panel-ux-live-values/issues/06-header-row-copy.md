# Copy icon on each header row (raw value)

Status: resolved
Blocked by: 01

## What
In `request-detail.ts`, each request and response header `.kv` row shows a copy icon on hover or focus. It copies the **raw** header value even when the header is masked (ADR 0006). The toast says "Copied <Name>" or "Copied <Name> (unmasked)". Change the options page wording for "Masked headers" to say that header copy is not masked, while cURL, fetch and HAR are.

## Acceptance
- e2e: copying a masked `Authorization` row puts the raw value on the clipboard. Copy as cURL is still masked.
- The icon can be reached with the keyboard.

## Comments

2026-10-26: Implemented: copy icon on every header row, raw value, "(unmasked)" confirmation when masked; options wording updated. e2e: e2e/ux.spec.ts.
