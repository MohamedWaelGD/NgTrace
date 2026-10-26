# Hook: wrap functional and class interceptors

Status: resolved
Blocked by: 01

## What
From the patched `HttpClient.request` (`this.handler`), find the handler's injector records: the `HTTP_INTERCEPTOR_FNS` multi record (by `_desc`) and the `HTTP_INTERCEPTORS` instances. Replace each function with a wrapper that snapshots the incoming request and the one passed to `next`, notes a short-circuit, and counts re-subscriptions of `next` after an error as Retries (setting `retryOf` / `attempt` on the resulting Captured Requests). Patch `intercept` on class instances. Clear `handler.chain`. Correlate steps with the Captured Request the backend eventually sends. Wrap each child environment injector's handler once.

## Acceptance
Unit tests with a fake handler/injector: steps recorded in order, header added by an auth interceptor, a cache interceptor short-circuits, `retry(1)` inside an interceptor gives attempt 2. Demo: add an auth-header interceptor, a short-circuiting cache interceptor and a retrying interceptor.

## Comments
2026-10-26: Implemented (hook interceptors.ts InterceptorTracker: wraps HTTP_INTERCEPTOR_FNS entries and HTTP_INTERCEPTORS intercept per handler, clears handler.chain; AngularInternals SendSlot carries steps and attempts; interceptor Retries get attempt/retryOf; short-circuited chains are recorded with shortCircuitedBy; demo auth/cache/retry interceptors on /interceptors; interceptors.test.ts).
