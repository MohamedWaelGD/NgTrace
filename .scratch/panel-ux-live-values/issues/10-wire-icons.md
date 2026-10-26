# Wire extension icons into the manifest and DevTools panel

Status: resolved
Blocked by: 09

## What
Add `"icons": {16,32,48,128}` to `extension/static/manifest.json`. Pass the icon path to `chrome.devtools.panels.create` in `extension/src/devtools.ts` (it currently passes `''`). Make sure `scripts/build-extension.mjs` copies `static/icons/`.

## Acceptance
- `npm run build` output contains the icons. The extension loads unpacked with its icon shown in `chrome://extensions` and on the DevTools tab.

## Comments

2026-10-26: Implemented: manifest `icons` and the DevTools panel icon (icons/icon-32.png).
