# Error and retry insight — spec

Terms: `GLOSSARY.md` (Failed Request, Retry, Attempt Number, Owner Component, Owner Service, Waste Signal, Duplicate, Replayed Request, Mock Rule). Second feature, `docs/ideas.md` #7.

## Scope
- **Failed Request**: network-level error or status ≥ 400; aborted requests excluded. Mocked failures count, keep the Mocked badge.
- **Retry (service level)**: the hook tags each observable returned by the patched `HttpClient.request` with an id; each subscription after the first, following a failed attempt, is a Retry. Each attempt is its own Captured Request carrying `retryOf` (first attempt's id) and `attempt` (Attempt Number). Interceptor-level Retries come with the interceptor chain feature (`.scratch/interceptor-chain/`), which sets the same fields.
- A Retry is never a Duplicate or other Waste Signal. A chain whose last attempt succeeded is "recovered".
- UI, following the Waste Signal pattern: a row badge (`Failed 500`, `Attempt 2`, `Recovered`), a "Failed only" filter chip in the table and Timeline, a failure count on component tree nodes, and a Failures summary grouped by Owner Component (Unattributed grouped by Owner Service).
- Works in production builds.

## Out of scope
- Retry detection for raw `fetch`/XHR; look-alike heuristics; predicting the total number of attempts.
