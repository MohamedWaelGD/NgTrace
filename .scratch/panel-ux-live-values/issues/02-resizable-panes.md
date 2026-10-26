# Resizable panes

Status: resolved

## What
Drag splitters between tree | table | detail (horizontal) in `app.html`/`app.css`, and between the component tree and `app-component-details` inside the tree pane (vertical). Use pointer events with pointer capture. Store sizes in `localStorage` under one key, wrapped in try/catch. Double-click a splitter to reset it to the defaults (today's 22% / 1fr / 45%).

## Acceptance
- Minimums are respected (tree ≥180px, table ≥240px, detail ≥320px, details pane ≥80px). Splitters clamp when the DevTools window shrinks.
- Sizes survive closing and reopening DevTools. The detail column keeps its width when the detail pane is closed and opened again.
- Text isn't selected while dragging, and there's a resize cursor on hover.
- e2e: drag a splitter, reload the panel, and the width is unchanged.

## Comments

2026-10-26: Implemented: Splitter directive + PaneLayout (localStorage `ngapi.layout`) in layout.ts. Also fixed the panel grid so the panes fill the height when no notice is shown. e2e: e2e/ux.spec.ts.
