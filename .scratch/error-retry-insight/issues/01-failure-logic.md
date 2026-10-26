# Pure failure and retry-chain logic

Status: ready-for-agent
Blocked by: none

## What
`packages/protocol/src/failures.ts`: `isFailed(request)`, `retryChains(requests)` (chain per `retryOf`, recovered flag), `summariseFailures(requests)` grouped by Owner Component, then Owner Service for Unattributed. Add optional `retryOf` and `attempt` to `CapturedRequest`. `detectWaste` skips requests with `attempt > 1`.

## Acceptance
Unit tests: 4xx/5xx/network error counted, abort not; mocked failure counted; recovered chain; Retry never flagged as Duplicate; grouping for Unattributed by Owner Service.
