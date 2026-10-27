# Export to code and tools — spec

Terms: `GLOSSARY.md` (Captured Request, Owner Component). `docs/ideas.md` #10. Build order: 2 of 3. Copy as cURL and `fetch`, and HAR export, already exist (`packages/protocol/src/export.ts`).

## Scope
- **Postman collection** (v2.1) of the visible requests, from the toolbar Export menu. One folder per Owner Component plus an "Unattributed" folder, absolute URLs, no collection variables, one item per Captured Request in time order. Insomnia is covered by importing the HAR or the Postman file; no separate format.
- **Playwright and Cypress stubs**: network-mocking stubs (`page.route(...).fulfill` / `cy.intercept(...)`) that replay the captured status, headers and body. Offered for the selected request (Copy menu) and the visible set (Export menu). One route per unique method + exact URL (query included), using the latest captured response; a comment names the Owner Component. A body truncated at 1 MB gets a "truncated" comment in the stub.
- **Masking**: all new exports follow the masking setting, with an unmasked variant in the Export menu, like HAR. Masked exports also blank **query parameter values** whose names match the masking pattern (`token|secret|api-key`), in all masked exports (cURL, `fetch`, HAR, Postman, stubs). JSON bodies are exported as captured; the README says so.
- No new settings. Options page text mentions the new exports.

## Out of scope
- Insomnia-native format, wildcarding stubs by Endpoint, body-field masking, direct-API-call tests.
