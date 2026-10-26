# fetch/XHR capture with stack attribution

Status: resolved

Patch fetch + XHR at document_start; record Captured Requests into ring buffer; stack-trace attribution to Owner Component with Call Chain; HttpClient tagging; body formatting rules; 1 MB cap.

## Comments

2026-10-26: implemented on main (initial implementation commit). Covered by unit tests and/or e2e/*.spec.ts.
