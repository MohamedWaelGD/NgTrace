# Mock and delay fetch

Status: resolved
Blocked by: 01

## What
The hook applies rules to `fetch`: canned Response, network error, delay, pass-through. The request is recorded as mocked.

## Acceptance
Unit tests with a fake fetch; e2e: a rule makes a component show its error state.

## Comments
2026-10-26: Implemented (mock.ts, mock-engine.ts, capture.ts fetch+XHR, mocks-pane.ts, e2e/mocking.spec.ts).
