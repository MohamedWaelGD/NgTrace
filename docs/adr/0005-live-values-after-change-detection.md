# 5. Read Live Values after change detection, not per signal

Status: accepted (2026-10-26)

## Context
The Details pane showed component State only when the user pressed refresh. We want Live Values for the selected component or service. Options: re-read values after each change-detection cycle; poll on a timer; or wrap every signal to track its writes.

## Decision
While Recording is on, the page hook re-reads only the selected component (or service) after each change-detection cycle, throttled to about 250 ms, and sends a diff of what changed. If one read takes over ~8 ms, it updates less often, down to about once a second, and the panel says it is throttled.

## Consequences
- Works the same with and without Zone.js, and covers plain fields as well as signals. A value changed outside change detection appears on the next cycle.
- Wrapping signals was rejected: it reaches into private Angular internals, costs something on every signal in the app, and still misses plain fields.
- Only one target is watched at a time, so the cost does not grow with app size.
