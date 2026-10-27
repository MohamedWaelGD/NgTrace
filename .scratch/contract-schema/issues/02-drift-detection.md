# Drift detection per Endpoint

Status: resolved
Blocked by: 01

## What
In `contract.ts`: `buildContract(requests, endpoint)` returns the merged shape, the skipped requests (truncated or non-JSON; non-2xx excluded) and the Drift entries with the ids of disagreeing requests.

## Acceptance
Unit tests: type change, optional field, nullable field, empty array not Drift, truncated body skipped and listed, 4xx/5xx excluded.

## Comments

2026-10-27: Implemented (packages/protocol/src/contract.ts, panel request-contract.ts, demo-app contract component, e2e/contract.spec.ts).

2026-10-27: Responses answered by a Mock Rule are ignored, since a canned body would cause false Drift.
