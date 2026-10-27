# Ideas and improvements

Candidate features for NgTrace, grouped by theme. Terms in **bold** follow `GLOSSARY.md`.

## Highest-value additions

1. **Replay / edit-and-resend.** Re-send a **Captured Request**, optionally after editing headers, body or query, and diff the new response against the original.
2. **Request mocking and throttling per component.** Override the response (status, body, delay) for a URL pattern or an **Owner Component**, e.g. make `ProductListComponent`'s calls fail with 500 to test error states. Needs a page-side hook alongside the existing capture hook.
3. **Duplicate and waste detector.** Flag the same URL fired N times in a window, calls fired in a single change-detection cycle, and requests cancelled by `switchMap`. Group by **Owner Component**.
4. **Request waterfall / timeline view.** Requests on a time axis, grouped or coloured by **Owner Component**, with **Route Phase** and navigation markers.

## Deepening the Angular-specific angle

5. **Signals and `HttpResource` support.** Show `resource()` / `httpResource()` / `toSignal` as owners. Extend **Live Values** to signals and computed dependencies.
6. **Interceptor chain view.** Show which `HttpInterceptor`s touched each request and what each changed (headers added, retries), using the **Call Chain** as evidence.
7. **Error and retry insight.** Group failures by **Owner Component**; detect retry patterns and show the attempt number.
8. **State timeline for Live Values.** Keep short per-component value history and let the user scrub back to see what changed before a request fired (fits ADR 0005: values read after change detection).
9. **Request-to-template jump.** "Reveal in Elements" for the Owner Component's host element; "open in editor" if source maps expose the file.

## Workflow and sharing

10. **Export to code and tools.** Copy as cURL, `fetch`, Postman/Insomnia collection, or a Playwright/Cypress stub from captured traffic. (Quick win: cURL and `fetch`.)
11. **Session save, load and compare.** Save a **Recording** to a file, share it, and diff two sessions (e.g. before and after a refactor).
12. **Contract and schema view.** Infer JSON shape from responses, show type drift across calls, generate TypeScript interfaces from a response body.
13. **Saved filters, presets and pinned requests.** Persist filter presets; pin a request so it survives clearing.
14. **Sensitive-data guardrails.** Auto-detect and decode JWTs in the drawer (claims, `exp` countdown), complementing **Quick-copy Headers**.

## Quality and reach

15. **Multi-frame and micro-frontend support.** Cover iframes, Module Federation and multiple Angular roots; show the root per request.
16. **Zoneless and SSR checks.** Add an "attribution health" indicator showing the share of `context`, `stack` and `none` **Attribution Confidence**, so users know when to trust it.
17. **Edge / Firefox port.** Edge is nearly free given the DevTools architecture; Firefox needs API shimming.
18. **Performance budget.** Surface hook overhead, ring-buffer usage and memory to show it is safe on large apps.
19. **Onboarding and empty states.** Handle "Angular not detected", "production build (minified component names)" and "reload to capture early requests".

## Suggested order

1. **#10** copy as cURL / `fetch` (quick win).
2. **#3** duplicate detector and **#1** replay (differentiators that use attribution).
3. **#2** mocking (largest; deserves its own spec under `.scratch/`).
