# 3. Keep the request ring buffer inside the page

Status: accepted (2026-10-26)

## Context
Requests made during bootstrap (`ngOnInit`, `APP_INITIALIZER`) happen before anyone opens DevTools. The MV3 service worker can be terminated by Chrome at any time, so it cannot hold state reliably.

## Decision
The main-world hook injects at `document_start` on allowed origins and records into an in-page ring buffer (default 1,000 Captured Requests). When the panel opens it pulls a snapshot, then receives live updates relayed by the content script and service worker.

## Consequences
- A full page reload clears the buffer unless the panel has it and Preserve log is on (the panel then keeps its own copy).
- Memory cost lives in the inspected page; response bodies are capped at 1 MB and binary bodies are never stored.
