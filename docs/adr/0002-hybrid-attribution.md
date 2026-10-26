# 2. Hybrid attribution: owner context first, stack trace fallback

Status: accepted (2026-10-26, revised the same day during implementation)

## Context
The browser does not know which component caused a request. Stack traces at send time are simple but lose the trail across async gaps (`debounceTime`, timers, route-param `switchMap`). Zoneless Angular (v18+) has no Zone to carry context.

The first idea was to wrap each discovered component's methods so their work ran in a child zone tagged with the Instance Id. That fails for the most common case: `ngOnInit` has already run by the time a component is discovered in the DOM.

## Decision
- **Sync context:** register a profiler through `ng.ɵsetProfiler` (dev mode; v22 allows several profilers side by side, older versions keep only the last one set, so Angular DevTools' profiler can displace ours). `LifecycleHookStart/End` and `OutputStart/End` tell us which component instance is running. The hook pre-creates `window.ng` with an accessor, so the profiler is installed the moment Angular publishes it, before the first lifecycle hook runs.
- **Async context:** the owner current when a timer, `requestAnimationFrame`, microtask, `Promise.then` or XHR listener is scheduled is restored when the callback runs. When zone.js loads, `Zone.prototype.scheduleTask/runTask` are tagged the same way, which covers ZoneAwarePromise microtasks. This works with and without zone.js.
- **Route phase:** the hook finds the Router among the root injector's records (duck-typed, no token needed) and watches its events. Between `GuardsCheckStart`/`ResolveStart` and their end events, requests belong to the component the target route activates (via `route`). This beats the async context, which is usually the click that started the navigation.
- **Creation stack:** `HttpClient.prototype.request` is wrapped so each observable remembers the stack where it was created. Cold observables are often subscribed by the router or an `async` pipe, so the Call Chain and Owner Service come from the creation stack; a component in the subscribe stack still wins.
- **Precedence:** sync context → component class in the stack (subscribe site, then creation site; an instance is resolved from the async owner, or from the only live instance) → route phase → async context → Unattributed. Confidence is `context`, `stack` or `none`, and every request carries its Call Chain as evidence.
- Requests with no component yet in the registry (constructors during bootstrap) are re-attributed after later tree scans.

## Consequences
- The route phase is global: an unrelated timer request that fires during a slow resolver is also attributed to the route (only when nothing better is known).
- Navigations started before the first component is created (`withEnabledBlockingInitialNavigation`) are not watched; their resolver requests stay Unattributed with an Owner Service.
- Native `async/await` in zoneless apps does not go through `Promise.prototype.then`, so the owner can be lost after an `await`.
- `ng build` bundles framework code with app code, so framework class names are filtered by a denylist to keep Call Chains readable.
- Covered end to end by `e2e/attribution.spec.ts`, `e2e/services.spec.ts` and `e2e/zoneless.spec.ts`.
