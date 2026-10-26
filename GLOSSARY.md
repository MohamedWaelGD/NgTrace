# Glossary

**Captured Request**
One XHR or `fetch` call recorded by the page hook: request (method, URL, query, headers, body), response (status, headers, body capped at 1 MB), timing, and its attribution. Lives in the page-side ring buffer.
_Avoid_: call, log entry, network event.

**Owner Component**
The nearest Angular component *instance* that caused a Captured Request. Exactly zero or one per request.
_Avoid_: caller, source component.

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
