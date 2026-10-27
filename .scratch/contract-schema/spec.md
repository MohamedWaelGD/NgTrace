# Contract and Drift view — spec

Terms: `GLOSSARY.md` (Endpoint, Contract, Drift, Captured Request). `docs/ideas.md` #12. Build order: 3 of 3.

## Scope
- **Endpoint** grouping: method + path with numeric, UUID and long-hex segments replaced by `:id`; query string ignored.
- **Contract tab** in the request drawer for the selected request's response: the inferred shape (fields, types, optional, nullable) from all buffered 2xx JSON responses of its Endpoint.
- **Drift** section: fields whose type changed, that are present in some responses and missing in others (optional), or mix `null` with a value (nullable). Each flagged field links to the Captured Requests that disagree. An empty array is "unknown element type", not Drift.
- **Copy as TypeScript**: named `interface`s, not inline types. Root name from the last non-placeholder path segment, singularised (`/api/products/:id` → `Product`), fallback `Response`. Nested interfaces are `ParentChild`. Optional/nullable from Drift. Arrays merge into a union of element shapes seen. Copy only, no download.
- **Limits**: bodies truncated at 1 MB are skipped and listed as "Truncated, not inferred"; arrays are sampled at their first 100 elements; non-JSON, binary or empty bodies show "No JSON body"; only 2xx responses feed the Contract.
- Computed in the panel over the buffered requests; no hook change. Replayed Requests count like any other. Contracts hold shapes, never values, so masking does not apply.
- No new settings.

## Out of scope
- Cross-session or persisted Contracts, OpenAPI export, request-body Contracts, file download.
