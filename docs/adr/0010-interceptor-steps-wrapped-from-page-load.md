# 10. Record Interceptor Steps by wrapping interceptors from page load

Status: accepted (2026-10-26)

## Context
The Call Chain only names interceptors that happen to be on the stack, and cannot say what each changed. A Retry placed inside an interceptor (`next(req).pipe(retry())`) re-subscribes only the downstream chain, so it is invisible to the existing `HttpClient.request` wrapper.

## Decision
When the hook patches `HttpClient` (dev mode only), it also wraps every entry of the `HTTP_INTERCEPTOR_FNS` record and the `intercept` method of each `HTTP_INTERCEPTORS` instance, and clears the handler's cached chain so it is rebuilt with the wrappers. Each wrapper snapshots the request it received and the one it passed to `next`, and counts re-subscriptions of `next` as Retries. Unlike Mock Rules (ADR 8) this is on from page load, not armed with the panel: it only observes and never changes a request, and bootstrap requests need Interceptor Steps too.

## Consequences
- Interceptor names are readable only in dev builds; inline arrow interceptors show as anonymous.
- Child environment injectors (lazy routes) have their own handler and are wrapped when first seen.
- Response-side changes made by interceptors are not recorded in v1.
