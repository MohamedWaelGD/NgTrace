# 4. Page hook is the source of truth; DevTools HAR enriches it

Status: accepted (2026-10-26)

## Context
The page hook sees app-set headers, bodies and attribution, but not browser-added headers (`Cookie`, `Origin`, `Sec-*`), wire timing, or CORS failure detail. `chrome.devtools.network` sees those but only while DevTools is open, and knows nothing about components.

## Decision
Captured Requests from the hook are authoritative. While the panel is open, each `onRequestFinished` HAR entry is matched to a Captured Request by method + URL + nearest start time (within 2 s) and its request headers are merged in as Enrichment. Unmatched hook entries show "app-level headers only".

## Consequences
- Matching is heuristic; identical concurrent requests may swap enrichment, which is harmless because they share URL and method.
