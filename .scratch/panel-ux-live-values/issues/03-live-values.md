# Live Values for the selected component or service

Status: resolved

## What
See ADR 0005. In the hook, keep a watch target: the component id or service id sent with `get-details` or the service selection. Clear it on deselect.

After each change-detection cycle (with and without Zone.js; find a hook point such as `ApplicationRef.tick` or a profiler/afterRender event that works in both demo configurations), re-read the target's inputs and state, plus any value-tree paths the panel has expanded. Updates go out at most every ~250 ms. Diff the result against the last one sent and post only what changed (a new message type in `packages/protocol`).

Pausing Recording stops the watch; ⟳ still forces a single read. In the panel, merge the diffs into `details` and the `expansions` map without collapsing anything.

## Acceptance
- Unit test: the diff produces an empty result when nothing changed and lists exactly the changed paths.
- e2e (default and zoneless demo): select a component, change its signal or field state in the demo app, and the Details pane updates without pressing ⟳. While paused it doesn't update; ⟳ updates it.
- Selecting another component stops updates for the previous one.

## Comments

2026-10-26: Implemented: hook LiveValues (extension/src/hook/live.ts) runs on ChangeDetectionEnd (Angular 20+) or TemplateUpdateEnd (older), panel command `live-target`, message `live`. Unit: packages/protocol/src/live.test.ts. e2e: zone.js + zoneless. Not covered by a test: switching selection stops updates for the previous target (the hook keeps a single target, so it is replaced).
