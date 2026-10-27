# TypeScript interface generation

Status: needs-triage
Blocked by: 02

## What
In `contract.ts`: `toTypeScript(contract, endpoint)` with root naming, singularisation, `ParentChild` nesting, optional `?`, nullable `| null`, union arrays.

## Acceptance
Unit tests: naming rules and fallback, nested interfaces, optional/nullable, arrays of unions, identifiers that need quoting.
