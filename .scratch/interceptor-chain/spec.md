# Interceptor chain view — spec

Terms: `GLOSSARY.md` (Interceptor Step, Retry, Attempt Number, Call Chain). Decisions: `docs/adr/0010`. Third feature, `docs/ideas.md` #6.

## Scope
- When the hook patches `HttpClient` (dev builds only), it wraps every `HTTP_INTERCEPTOR_FNS` entry and each `HTTP_INTERCEPTORS` instance's `intercept`, then clears the handler's cached chain. On from page load, not armed with the panel.
- Each wrapper records an **Interceptor Step**: name (or *anonymous*), request changes between what it received and what it passed to `next` (headers added/removed/changed, URL, params, method, body), short-circuit (returned without calling `next`), and Retries it started (re-subscriptions of `next` after an error).
- Interceptor Retries set `retryOf` / `attempt` like service-level Retries (`.scratch/error-retry-insight/`).
- Drawer: a new **Interceptors** tab listing steps in order (functional first, then class-based inside Angular's legacy step). Masked headers stay masked in diffs.
- Child environment injectors (lazy routes) are wrapped when first seen.
- Production builds: tab disabled with "Needs a development build".

## Out of scope
- Response-side changes; timing per interceptor; editing or disabling an interceptor from the panel.
