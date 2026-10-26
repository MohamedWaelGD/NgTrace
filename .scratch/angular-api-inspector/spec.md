# Angular API Inspector — spec

A Chromium MV3 DevTools extension adding an **Angular API** panel that shows the Angular component tree and, for each component instance, the Captured Requests it caused (see `GLOSSARY.md`, `docs/adr/`).

## Scope (v1)
- Angular 14+ dev mode (Ivy). Prod builds / non-Angular pages: panel explains and stays idle.
- Injects only on `localhost`, `127.0.0.1`, `*.localhost` by default; more origins via options (optional host permissions).
- Captures all XHR + `fetch`; tags HttpClient-originated ones. WebSocket/SSE/GraphQL later.
- Per request: method, URL, query, request headers + body, status, response headers + body (≤1 MB), timing, Owner Component, Call Chain, Attribution Confidence.
- Bodies: JSON pretty/tree, text raw, FormData/URLSearchParams key/value, binary type+size only.
- Always-on recording into a page-side ring buffer (1,000). Panel: Preserve log, Clear, Pause.
- Enrichment from `chrome.devtools.network` while open.
- UI: tree (request-count badges, hover highlight, element picker, ghost nodes, read-only inputs) | request table (scoped to selection; include-descendants; group by class) | detail drawer (Headers, Payload, Response, Preview, Timing, Initiator).
- Filters: text, `/regex/`, `-` negation, Invert, `method:` `status-code:` `domain:` `mime-type:` `larger-than:` `has-request-header:` `has-response-header:` `component:`; type chips All/HttpClient/Other XHR/Fetch; status chips 2xx/3xx/4xx/5xx/Failed. Property-key autocomplete.
- Copy as cURL / fetch / response / URL; Export HAR with `_angular`.
- Masked headers (Authorization, Cookie, Set-Cookie, Proxy-Authorization, `/token|secret|api[-_]?key/i`, configurable) masked in UI, copy and export unless explicitly unmasked.
- Multiple Angular roots per top frame; no iframes.
- Theme follows DevTools.

## Layout
- `packages/protocol` — shared types + pure logic (filters, masking, cURL/HAR, enrichment matching).
- `extension/` — manifest, esbuild scripts (`hook`, `content`, `background`, `devtools`), Angular `panel`.
- `demo-app/` — attribution scenarios; Playwright e2e in `e2e/`.
