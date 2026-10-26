# 7. Replay runs in the page through the native fetch

Status: accepted (2026-10-26)

## Context
A Replayed Request can be sent from the extension (no CORS limits, but not what the app experiences) or from the inspected page. Angular's `HttpClient` could also be reused, but its interceptors would run a second time and change the request.

## Decision
The hook keeps a reference to the native `fetch` from before it patches it, and Replay sends through that. The request is sent exactly as edited, with no Angular interceptors. It is recorded as a new Captured Request linked to the original.

## Consequences
- Cookies, same-origin rules and CORS behave as they do for the real call.
- Headers added by interceptors must already be in the captured headers; they are, because the hook sees app-set headers.
- Binary or truncated bodies cannot be replayed unless the user supplies a replacement body.
- Non-GET/HEAD replays ask for confirmation, since they can change real data.
