# Toolbar Quick-copy from the latest request

Status: resolved
Blocked by: 07

## What
Add a toolbar dropdown button in `app.html` listing each Quick-copy Header. Choosing one copies the value from the **most recent** Captured Request (across all requests, not just the visible ones) that has that header. When the value starts with `Bearer `, the dropdown also offers "token only". A header that no request carries is disabled, with the tooltip "No captured request has <Name>".

## Acceptance
- e2e: after two requests with different `Authorization` values, the toolbar copies the newer one. After Clear, the item is disabled.

## Comments

2026-10-26: Implemented: QuickCopyMenu in the toolbar. "Newest value wins" is covered by the unit test (the demo app only sends one Authorization value); e2e covers copy and the disabled state after Clear.
