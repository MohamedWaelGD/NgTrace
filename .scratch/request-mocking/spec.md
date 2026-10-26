# Request mocking and throttling — spec

Terms: `GLOSSARY.md` (Mock Rule). Decisions: `docs/adr/0008`. Fourth feature, `docs/ideas.md` #2.

## Scope
- Mock Rule: method + URL pattern (glob, regex mode) + optional Owner Component class; action canned response, network error, delay, or pass-through. First match wins, top to bottom.
- The hook applies rules to `fetch` first, then XHR. Mocked requests are buffered with `mocked: true`, shown with a badge and "no wire data".
- Rules saved per origin in `chrome.storage.local`, applied only while the panel is open, matching requests held until delivery (500 ms timeout + warning), armed while Recording is paused.
- Mocks pane in the panel, plus "Mock this request…" in the drawer.

## Out of scope
- Bandwidth throttling, import/export, instance matching, WebSocket/SSE, GraphQL matching.
