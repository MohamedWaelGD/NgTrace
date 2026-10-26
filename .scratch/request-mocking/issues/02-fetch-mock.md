# Mock and delay fetch

Status: ready-for-agent
Blocked by: 01

## What
The hook applies rules to `fetch`: canned Response, network error, delay, pass-through. The request is recorded as mocked.

## Acceptance
Unit tests with a fake fetch; e2e: a rule makes a component show its error state.

## Comments
