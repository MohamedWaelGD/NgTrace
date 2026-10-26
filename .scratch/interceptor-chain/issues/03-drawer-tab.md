# Interceptors tab in the request drawer

Status: ready-for-agent
Blocked by: 02

## What
New tab listing Interceptor Steps: name, diff (masked headers masked), short-circuit marker, Retry count with links to the attempts. Disabled with "Needs a development build" when the hook reports no interceptor support.

## Acceptance
e2e: a demo request shows the auth interceptor adding `Authorization` (masked) and the cache interceptor short-circuiting a repeat.
