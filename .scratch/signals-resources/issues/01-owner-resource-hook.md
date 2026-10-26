# Hook: find resources on component fields and wrap their loaders

Status: resolved
Blocked by: none

## What
On a component instance's first `TemplateCreate` profiler event, scan its own enumerable fields for resource objects (duck-typed: `loaderFn`, `effectRef`, `value`/`status` signals) and wrap `loaderFn` once to set a current Owner Resource during its synchronous run. Attribution takes it at the sync-context precedence level (ADR 2). Add optional `ownerResource` to `Attribution`. Add a "resource loader" step to the Call Chain when `loadEffect` / `HttpResourceImpl` frames appear without a known resource.

## Acceptance
Unit tests with fake resource objects: a wrapped loader tags the request; unknown loader frames give the fallback step. Demo: a component with an `httpResource` (with and without `debugName`) and an `rxResource`; e2e asserts the Owner Resource and Owner Component.

## Comments
2026-10-26: Implemented (hook resources.ts ResourceTracker on TemplateCreate; OwnerContext.runAs; Attribution.ownerResource / via 'resource'; 'resource loader' Call Chain step; demo /resources; resources.test.ts, e2e/signals-resources.spec.ts).
