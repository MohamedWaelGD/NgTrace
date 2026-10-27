# Security Policy

The extension runs a script in every web page you open and sees the requests those pages make, so security problems in it matter even though it never sends data anywhere.

## Reporting a vulnerability

**Please do not open a public issue.** Report it privately through GitHub: go to the [Security tab](https://github.com/MohamedWaelGD/NgTrace/security/advisories/new) and choose *Report a vulnerability*.

Include what an attacker can do, the steps to reproduce, and the extension and Chrome versions. You should get a reply within 7 days. Once a fix is published to the Chrome Web Store the advisory is made public, crediting you unless you prefer otherwise.

## In scope

- Captured data (headers, bodies, tokens) reaching anything other than the DevTools panel: another page, another extension, a network request, disk.
- A web page using the injected hook to read data from other origins, run code in the extension's context, or change the extension's settings.
- Masked headers or query parameters appearing unmasked on screen or in exports.
- The hook breaking or changing the behaviour of the page it is injected into in a way a site could exploit.

## Out of scope

- A page reading its own requests through the hook: the page already has them.
- Someone with access to your unlocked computer and open DevTools.
- Problems in Angular, Chrome or third-party dependencies with no extension-specific impact (report those upstream).

## Supported versions

Only the latest version published on the Chrome Web Store receives fixes.
