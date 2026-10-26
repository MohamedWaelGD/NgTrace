# Hook: tag HttpClient observables and number attempts

Status: resolved
Blocked by: 01

## What
In `AngularInternals.patchHttpClient`, give each wrapped observable an id and count subscriptions. Expose the current observable id and attempt while subscribing (alongside `creationStack`) so the capture layer sets `retryOf` / `attempt` on the request it records. Only a subscription that follows a failed attempt counts as a Retry; a second independent subscriber (e.g. two `async` pipes) does not.

## Acceptance
Unit test with a fake Observable: `retry(2)` against a failing backend gives attempts 1–3 linked to the first; two independent subscriptions give two attempt-1 requests. Demo: add a flaky endpoint and a service using `retry(2)`; e2e asserts `Attempt 2` and `Recovered`.

## Comments
2026-10-26: Implemented (AngularInternals.patchHttpClient numbers subscriptions; claimAttempt tags the first recorded request; demo /errors with FlakyService retry(2) and /api/flaky; angular-internals.test.ts, e2e/errors.spec.ts).
