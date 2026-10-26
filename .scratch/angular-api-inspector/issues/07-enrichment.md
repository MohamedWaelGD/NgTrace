# HAR enrichment

Status: resolved

Match devtools.network onRequestFinished entries to Captured Requests (method+URL+nearest start ≤2s); merge browser headers; mark unenriched as app-level only.

## Comments

2026-10-26: implemented on main (initial implementation commit). Covered by unit tests and/or e2e/*.spec.ts.
