# Angular API Inspector

A Chromium DevTools extension that adds an **Angular API** panel: the Angular component tree, and for every component instance the API requests it caused, with payload, query, headers, response, and a Network-tab-style filter bar.

See `GLOSSARY.md` for terms (Captured Request, Owner Component, Call Chain, Attribution Confidence…) and `docs/adr/` for the design decisions.

## Use it

```bash
npm install
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, **Load unpacked** → `dist/extension`. Open DevTools on an Angular app served in dev mode (`ng serve`) on `localhost` / `127.0.0.1` / `*.localhost`, then pick the **Angular API** tab. Other origins (a dev or staging host) can be added in the extension's options page.

Requires Angular 14+ in dev mode. Production builds are detected and reported; their requests are recorded but cannot be attributed.

## How attribution works

A main-world script injected at `document_start` patches `fetch` and `XMLHttpRequest` and records every request into a page-side ring buffer (1,000 entries), so requests made before DevTools opens are kept. Each request gets an Owner Component, in this order (ADR 2):

1. **context (lifecycle / listener / resource)**: the component whose lifecycle hook or template listener is running, via Angular's dev-mode profiler (`ng.ɵsetProfiler`), or whose `resource()` / `httpResource()` / `rxResource()` loader is running (the **Owner Resource**, ADR 9).
2. **stack**: a component class in the stack trace, where the request was subscribed or where its `HttpClient` observable was created (a constructor, an `async` pipe).
3. **context (route)**: requests sent while the router runs guards or resolvers belong to the component that route activates.
4. **context (async)**: the owner that scheduled the timer, microtask, XHR callback or Zone task the request runs in (debounced search, `setTimeout`, …). Works with and without zone.js.
5. **none**: Unattributed bucket (`APP_INITIALIZER`, effects, polling services, third-party code).

Every request also gets an **Owner Service** (the service that called `HttpClient`). Selecting a component shows its read-only **State** (signals unwrapped), the **services it injects** and where each came from (`Route: stores/:id`, `root`, a parent component), and its **injector path**. With *Include injected services* on, requests that no component started but that a service it injects made (a store loading itself, a polling service) appear on that component. Clicking a service shows its state and all its requests. These need Angular's DI debug APIs (verified on v22); on older versions the section is hidden.

The Initiator tab shows the confidence and the Call Chain behind every decision.

## Angular-specific tools

- **Request-to-template jump**: *Reveal in Elements* selects the Owner Component's host element; *Open in Sources* and *Open in editor* (per-origin project root and editor in the options page) open its source file, from `debugInfo` in dev builds.
- **Errors and retries**: Failed Requests get a badge, a *Failed only* filter and a per-owner Failures summary. Each `HttpClient` subscription after a failed attempt is a Retry with its Attempt Number; a chain that ends in success is *Recovered*.
- **Interceptor chain** (ADR 10): the *Interceptors* tab lists every interceptor a request went through, what it changed (masked headers stay masked), short-circuits (e.g. a cache hit, recorded even though nothing reached the network) and the Retries it started.
- **Signals and resources**: requests sent by a component's resources carry their Owner Resource (drawer, tree, `resource:` filter); the component's signals, computeds and what they depend on appear in Live Values.
- **Value History**: the Details pane keeps the last 200 changes of the selected component or service, with a scrubber whose markers are its requests; selecting one of those requests shows the values just before it was sent.

## Develop

```bash
npm test             # unit tests (vitest): filters, masking/export, enrichment, attribution, capture
npm run typecheck
npm run test:e2e     # builds extension + demo apps, runs Playwright against real Chrome
npm run build:demo && npm run demo   # demo app with all attribution scenarios on http://localhost:4321
```

The e2e suite starts the installed Google Chrome (`E2E_CHROME` to override the path) and loads the extension over CDP, because branded Chrome no longer honours `--load-extension`. Tests open the panel page directly with `?tabId=`; the DevTools-only parts (theme, HAR Enrichment) are not covered by e2e.

| Path | What |
| --- | --- |
| `packages/protocol` | Shared types and pure logic: filter engine, masking, cURL/fetch/HAR export, HAR matching |
| `extension/src/hook` | Main-world hook: capture, attribution, owner context, tree scan, overlay |
| `extension/src` | Content-script bridge, service worker, DevTools page, options page |
| `extension/panel` | The Angular panel UI |
| `demo-app` | Angular app with one component per attribution scenario (zone + zoneless builds) |
| `e2e` | Playwright tests and the demo API server |
