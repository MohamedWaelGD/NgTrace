# Endpoint templating and shape inference

Status: resolved
Blocked by: none

## What
Add `packages/protocol/src/contract.ts`: `endpointOf(request)`, `inferShape(json)` (with the 100-element array sampling) and `mergeShapes`.

## Acceptance
Unit tests: numeric/UUID/hex segments, query ignored, nested objects, arrays of objects, empty arrays, null, mixed-type arrays, sampling limit.

## Comments

2026-10-27: Implemented (packages/protocol/src/contract.ts, panel request-contract.ts, demo-app contract component, e2e/contract.spec.ts).
