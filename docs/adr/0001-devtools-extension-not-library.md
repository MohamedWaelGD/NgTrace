# 1. Ship as a DevTools extension, not an in-app library

Status: accepted (2026-10-26)

## Context
The tool must inspect any Angular dev-mode app and tie network requests to components. It could be an npm library rendered inside the app, or a Chromium DevTools extension with its own panel.

## Decision
A Manifest V3 DevTools extension (Chromium only) that adds an "NgTrace" panel and needs no change to the inspected app. A small optional npm helper may come later if attribution needs it.

## Consequences
- Works on Angular 14+ dev builds only (relies on `ng.*` debug globals and `__ngContext__`).
- Code runs in four contexts (page main world, content script, service worker, panel) joined by a typed message protocol (`packages/protocol`).
- Firefox is out of scope for v1.
