# Source location from debugInfo and Open in Sources

Status: ready-for-agent
Blocked by: none

## What
Hook: include `filePath` and `lineNumber` from `ɵcmp.debugInfo` in tree nodes / component details (absent in production builds). Protocol: a pure `sourceUrlCandidates(origin, filePath)` helper. Panel: "Open in Sources" tries candidates with `chrome.devtools.panels.openResource` (0-based line) until one succeeds; otherwise shows `filePath:line` with a copy button. Disabled with "Needs a development build" when there is no `filePath`.

## Acceptance
Unit tests for the candidate list. e2e: the demo app's component details show its `filePath:line`.
