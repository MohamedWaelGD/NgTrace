# Replace glyphs with Hugeicons

Status: resolved

## What
Add `@hugeicons/angular` and `@hugeicons/core-free-icons` (Stroke Rounded), bundled into the panel build with no CDN or remote loading. Replace every Unicode glyph in the panel: record ●, clear ⊘, refresh ⟳, close ✕, twisties ▾/▸, the picker, and any others. Add icons to Copy URL / cURL / fetch / response and Export HAR / unmasked. Every icon-only button keeps a `title` and an accessible label.

## Acceptance
- First check that both packages exist and work with Angular 22. If they don't, stop and comment here.
- No glyph characters remain in the panel templates (grep).
- The record icon still shows on/off through `.record.on` colour.
- Icons follow the DevTools light and dark themes via `currentColor`.
- Existing `data-testid`s are kept; `npm run test:e2e` passes.

## Comments

2026-10-26: Implemented: @hugeicons/angular 1.0.12 + core-free-icons 4.3.5 (peer range covers Angular 22). Icons live in extension/panel/src/app/icons.ts; the ⟂ table marker became plain text ("via X").
