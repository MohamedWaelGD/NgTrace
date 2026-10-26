# Duplicate and waste detector — spec

Terms: `GLOSSARY.md` (Waste Signal, Duplicate, Duplicate Window, Cancelled-then-refired, Owner Component). First of four features, see `docs/ideas.md` #3.

## Scope
- **Duplicate**: same method + normalised URL (query params sorted) + request body as an earlier request, for GET/HEAD only, sent while the earlier one is in flight or within the Duplicate Window (default 1,000 ms, setting in options). Replayed Requests are never flagged.
- **Cancelled-then-refired**: a request that ended `Aborted`, followed by the same method + URL within the Duplicate Window.
- Detection runs in the panel over the buffered requests; no hook change.
- UI: a badge on request rows (`Duplicate ×3`, `Cancelled`), a "Wasteful only" filter chip, and a Waste summary list grouped by Owner Component (count and wasted time).

## Out of scope
- The single-change-detection-cycle signal, non-idempotent duplicates, cross-reload detection.
