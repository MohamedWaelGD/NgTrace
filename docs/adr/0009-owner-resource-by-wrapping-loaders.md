# 9. Find Owner Resources by wrapping each resource's loader

Status: accepted (2026-10-26)

## Context
`resource()`, `httpResource()` and `rxResource()` run their loader inside an effect, so the stack at send time holds only the effect scheduler and no component frame (ADR 2 cannot attribute it). The profiler has no event for effect runs, and `resource`/`httpResource`/`effect` are module-private, so their creation cannot be hooked globally.

## Decision
When the hook first sees a component instance (its first `TemplateCreate` profiler event, before the component's first effect flush), it scans the instance's own fields for resource objects and wraps each one's `loaderFn` so the request it sends synchronously carries that Owner Resource and the component, at `context` confidence. The resource is named by its `debugName`, or else the field name.

## Considered Options
- Stack frames named `loadEffect`/`HttpResourceImpl`: tells us a resource sent the request, but not which one. Kept only as a fallback label in the Call Chain.
- Walking the effect node's `view` back to the component: needs the effect node at send time, which nothing hands us.

## Consequences
- Dev mode only; relies on private, writable `ResourceImpl` fields (`loaderFn`, `effectRef`) that may change between Angular versions.
- Resources held by services, or created after the first scan (e.g. in a method), are not found in v1; their requests stay Unattributed with a "resource loader" Call Chain step.
