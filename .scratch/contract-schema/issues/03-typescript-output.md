# TypeScript interface generation

Status: resolved
Blocked by: 02

## What
In `contract.ts`: `toTypeScript(contract, endpoint)` with root naming, singularisation, `ParentChild` nesting, optional `?`, nullable `| null`, union arrays.

## Acceptance
Unit tests: naming rules and fallback, nested interfaces, optional/nullable, arrays of unions, identifiers that need quoting.

## Comments

2026-10-27: Implemented (packages/protocol/src/contract.ts, panel request-contract.ts, demo-app contract component, e2e/contract.spec.ts).

A root array is written as its element interface plus `export type XList = X[]`; any other non-object root is `export type XResponse = ...`.
