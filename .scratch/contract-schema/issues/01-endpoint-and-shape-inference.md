# Endpoint templating and shape inference

Status: needs-triage
Blocked by: none

## What
Add `packages/protocol/src/contract.ts`: `endpointOf(request)`, `inferShape(json)` (with the 100-element array sampling) and `mergeShapes`.

## Acceptance
Unit tests: numeric/UUID/hex segments, query ignored, nested objects, arrays of objects, empty arrays, null, mixed-type arrays, sampling limit.
