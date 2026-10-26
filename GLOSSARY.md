# Glossary

**Captured Request**
One XHR or `fetch` call recorded by the page hook: request (method, URL, query, headers, body), response (status, headers, body capped at 1 MB), timing, and its attribution. Lives in the page-side ring buffer.
_Avoid_: call, log entry, network event.

**Owner Component**
The nearest Angular component *instance* that caused a Captured Request. Exactly zero or one per request.
_Avoid_: caller, source component.

**Owner Service**
The innermost non-component app class in the Call Chain: the service that called `HttpClient` (e.g. `ProductStore`). Set alongside the Owner Component, or alone for requests no component started.

**Route Phase**
The window between the router's `GuardsCheckStart`/`ResolveStart` and the matching end event. Requests sent in it, with no component in the stack, belong to the route's component (via `route`).

**Creation Stack**
The stack captured when an `HttpClient` observable is created. Cold observables are often subscribed elsewhere (router, `async` pipe), so the Call Chain is built from where the observable was created.

**Call Chain**
The ordered list of class/function names between the Owner Component and `HttpClient`/`fetch`/XHR, e.g. `ProductListComponent → ProductService → HttpClient`. Shown as evidence for the attribution.

**Attribution Confidence**
How the Owner Component was found: `context` (high: the component whose lifecycle hook or template listener is running, or the owner propagated to the async task the request runs in), `stack` (medium: a component class in the stack trace at send time), or `none` (Unattributed).

**Unattributed bucket**
Captured Requests with no Owner Component (effects, guards, resolvers, `APP_INITIALIZER`, third-party code), grouped by the first known service/class in the Call Chain.

**Ghost Node**
A destroyed component instance kept, greyed out, in the component tree so its Captured Requests stay selectable.

**Enrichment**
Merging a Captured Request with the matching `chrome.devtools.network` HAR entry (browser-added headers, wire timing). Requests captured before DevTools opened are not enriched ("app-level headers only").

**Instance Id**
A stable numeric id the page hook assigns to each component instance it has seen, used to link tree nodes and Captured Requests across the page/panel boundary.

**Recording**
The single on/off state that controls whether the panel takes in new data: Captured Requests and Live Values. While Recording is paused, the panel stays frozen; a manual refresh still reads values once.
_Avoid_: capture mode, live mode.

**Live Values**
The selected component's @Inputs and State (or the selected service's state), kept up to date after each change-detection cycle while Recording is on. Changed values flash briefly.
_Avoid_: realtime data, watch.

**Quick-copy Header**
A request header named in Settings (default `Authorization`) that gets a one-click copy button, both for the selected Captured Request and for the most recent Captured Request that carries it. Always copies the raw value, even when the header is masked on screen.
_Avoid_: token copy, auth copy.

**Replayed Request**
A Captured Request that the user re-sent from the panel, optionally after editing its method, URL, headers or body. Recorded as its own Captured Request, linked to the original it came from. Never counted as a Duplicate or other Waste Signal.
_Avoid_: retry, resend, repeat.

**Mock Rule**
A user-defined rule that matches outgoing requests by method and URL pattern, optionally narrowed to an Owner Component class, and either answers with a canned response, simulates a network error, delays the real response, or lets it through unchanged. A request answered by a rule is shown as Mocked.
_Avoid_: stub, override, intercept.

**Waste Signal**
A flag on a Captured Request showing it was probably unnecessary: a Duplicate, or a Cancelled-then-refired request. Summarised per Owner Component.

**Duplicate**
A Captured Request with the same method, normalised URL and body as an earlier idempotent request that was still in flight or finished within the Duplicate Window.

**Duplicate Window**
How long after an earlier identical request a repeat still counts as a Duplicate. Default 1,000 ms.

**Cancelled-then-refired**
A request that was aborted and then sent again with the same method and URL shortly afterwards (typically a `switchMap` restart).

**Timeline**
The view that lays Captured Requests on a time axis, one row each, coloured by Owner Component, with navigation and Route Phase markers. An alternative to the request table, sharing its selection and filters.

**Owner Resource**
The `resource()`, `httpResource()` or `rxResource()` whose loader sent a Captured Request, named after the component field that holds it (or its debug name), e.g. `ProductDetailComponent.product`. The component that holds it stays the Owner Component. `toSignal` is never an owner; it only appears as a step in the Call Chain.

**Retry**
A later attempt of the same `HttpClient` request, re-sent automatically after the previous attempt failed (an RxJS `retry` in a service or in an interceptor). Each attempt is its own Captured Request with an Attempt Number, linked to the first attempt. Never counted as a Duplicate or other Waste Signal.
_Avoid_: resend, replay (a Replayed Request is user-initiated).

**Attempt Number**
The position of a Captured Request in its Retry chain: 1 for the original, 2 for the first Retry, and so on.

**Failed Request**
A Captured Request that ended in a network-level error or a status of 400 or more. Aborted requests are not failures. Failures answered by a Mock Rule count but stay marked Mocked. A Retry chain whose last attempt succeeded is "recovered"; its failed attempts still count. Summarised per Owner Component.
_Avoid_: error request, broken call.

**Interceptor Step**
One `HttpInterceptor`'s part in one Captured Request: its name, what it changed in the outgoing request (headers, URL, params, method, body), whether it answered without passing the request on (short-circuited), and how many Retries it started.
_Avoid_: middleware, hook.

**Value History**
The recent Live Values of the selected component or service, kept from the moment it was selected, with the send times of its Captured Requests marked on it, so the user can scrub back to the values just before a request fired. Cleared when another target is selected.
_Avoid_: state log, snapshots.
