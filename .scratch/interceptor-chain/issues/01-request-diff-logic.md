# Pure HttpRequest snapshot and diff

Status: ready-for-agent
Blocked by: none

## What
`packages/protocol/src/interceptors.ts`: a serialisable `RequestSnapshot` (method, url, params, headers, body summary) and `diffRequests(before, after)` returning header adds/removes/changes and changed fields. Types for `InterceptorStep` and optional `interceptorSteps` on `CapturedRequest`.

## Acceptance
Unit tests: added/removed/changed headers, URL and params changes, body change detected by reference and by serialised value, no-op step yields an empty diff.
