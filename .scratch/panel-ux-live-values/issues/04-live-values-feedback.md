# Live Values: change flash, destroyed freeze, self-throttling

Status: resolved
Blocked by: 03

## What
- A row whose value changed flashes for ~600 ms. If the changed path is hidden under a collapsed node, the collapsed ancestor row flashes instead.
- When the watched component is destroyed, stop watching, keep the last values, and show "destroyed — last known values" in the Details header.
- In the hook, time each read. If it takes over ~8 ms, step the interval up toward ~1 s; step it back down once reads are fast again. Send the throttled state with each update, and show a "throttled" note in the Details header.

## Acceptance
- e2e: a changed value gets the flash class. Destroying the selected component (by navigating away in the demo) shows the frozen label.
- Unit test for the back-off: slow reads raise the interval, capped at 1 s, and fast reads bring it back down.

## Comments

2026-10-26: Implemented: flash, destroyed note, LiveThrottle back-off (unit tested), throttled note on component and service views. Deviation: only expanded paths are read (ADR 5), so a change hidden under a collapsed node flashes only when that row's own preview changes.
