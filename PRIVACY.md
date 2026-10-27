# Privacy Policy

NgTrace is a developer tool. It has no server, no account, no analytics and no telemetry. **No data captured by the extension ever leaves your browser.**

## What it reads

To attribute requests to components, a script runs in every `http` and `https` page from the moment it starts loading. It wraps `fetch` and `XMLHttpRequest` and records each request: URL, method, headers, query, request and response bodies, timing, and the stack trace and Angular component that caused it. It also reads Angular's dev-mode debug APIs to build the component tree and show component state.

This happens on every site, including sites that are not Angular apps, because the extension cannot know before the page loads whether it is one.

## Where it is kept

| Data | Where | How long |
| --- | --- | --- |
| Captured requests (up to 1,000 per page) | In the page's memory | Until the page is reloaded or closed |
| Component tree, state and Value History | In the DevTools panel's memory | Until DevTools is closed |
| Whether Mock Rules are armed (a single flag, no rule content) | The page's `sessionStorage` | Until the tab is closed |
| Your settings: masked headers, quick-copy headers, duplicate window, striped rows, and per-origin project roots and editors | `chrome.storage.sync` | Until you change them or remove the extension |
| Panel pane sizes | The panel's `localStorage` | Until you remove the extension |

Captured requests are never written to disk by the extension. `chrome.storage.sync` is synced by Chrome to your Google account if you have Chrome sync turned on; it contains only the settings listed above, never captured requests.

## What it sends

Nothing. The extension makes no network requests of its own. Data only leaves the panel when you explicitly copy or export it (Copy as cURL / fetch, HAR, Postman, test stubs), and masked headers are masked in those exports.

## Checking this yourself

The extension is open source. The capture code is in [`extension/src/hook`](extension/src/hook), and you can build it yourself and compare it to the published version (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Contact

Questions about privacy: open an issue at <https://github.com/MohamedWaelGD/NgTrace/issues>. To report a security problem privately, see [SECURITY.md](SECURITY.md).

_Last updated: 2026-10-27_
