# Drift detection per Endpoint

Status: needs-triage
Blocked by: 01

## What
In `contract.ts`: `buildContract(requests, endpoint)` returns the merged shape, the skipped requests (truncated or non-JSON; non-2xx excluded) and the Drift entries with the ids of disagreeing requests.

## Acceptance
Unit tests: type change, optional field, nullable field, empty array not Drift, truncated body skipped and listed, 4xx/5xx excluded.
