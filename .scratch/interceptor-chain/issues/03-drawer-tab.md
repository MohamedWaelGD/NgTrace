# Interceptors tab in the request drawer

Status: resolved
Blocked by: 02

## What
New tab listing Interceptor Steps: name, diff (masked headers masked), short-circuit marker, Retry count with links to the attempts. Disabled with "Needs a development build" when the hook reports no interceptor support.

## Acceptance
e2e: a demo request shows the auth interceptor adding `Authorization` (masked) and the cache interceptor short-circuiting a repeat.

## Comments
2026-10-26: Implemented (Interceptors drawer tab: steps with masked header diffs, short-circuit marker, retry count with attempt links; disabled with 'Needs a development build' outside dev builds; e2e/interceptors.spec.ts).
