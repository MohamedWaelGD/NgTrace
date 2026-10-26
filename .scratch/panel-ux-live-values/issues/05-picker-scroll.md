# Picker: scroll to and flash the picked component

Status: resolved

## What
`picked` already selects the node and calls `expandTo` (`inspector.store.ts`). Extend it:
- The hook resolves the nearest enclosing component of the picked element (check this already happens) and sends a short descriptor of the element, like `<span.price>`.
- After rendering, the tree scrolls the selected row to the middle of the pane, only if it is outside the visible area.
- The row flashes once, and a "from `<span.price>`" hint shows on it until the next selection.

## Acceptance
- e2e: in a tree long enough to scroll, picking an element deep in the page brings its component's row into view. Picking an already-visible row doesn't move the scroll position.
- Picking a plain element inside a component's template selects that component.

## Comments

2026-10-26: Implemented: picked descriptor from the hook, scroll-to-middle only when hidden (re-checked after the Details pane opens), one-shot flash, "from <el>" hint. e2e: e2e/ux.spec.ts.
