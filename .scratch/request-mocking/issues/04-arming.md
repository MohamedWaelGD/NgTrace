# Arm rules with the panel

Status: resolved
Blocked by: 02

## What
The panel sends rules and armed state. The hook holds possibly-matching requests until delivery (500 ms timeout + warning) and disarms when the panel closes. Rules are stored per origin.

## Acceptance
e2e: a rule applies to a bootstrap request; closing the panel disarms it.

## Comments
2026-10-26: Implemented (mock.ts, mock-engine.ts, capture.ts fetch+XHR, mocks-pane.ts, e2e/mocking.spec.ts).
