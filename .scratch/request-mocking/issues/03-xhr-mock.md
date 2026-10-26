# Mock and delay XHR

Status: resolved
Blocked by: 01, 02

## What
The same for XMLHttpRequest, including readyState, status, response and events.

## Acceptance
Unit tests with jsdom; e2e through HttpClient.

## Comments
2026-10-26: Implemented (mock.ts, mock-engine.ts, capture.ts fetch+XHR, mocks-pane.ts, e2e/mocking.spec.ts).
