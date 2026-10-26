# Signals and dependencies in Live Values

Status: ready-for-agent
Blocked by: none

## What
Hook: for a followed component, read `ng.ɵgetSignalGraph(ng.getInjector(host))` inside the Live Values read; serialise nodes (id, label, kind, value preview when cached) and edges. Diff with the previous read so only changes are posted (extends `LiveUpdate`). Counted in the Live Values read time and throttle. Panel: a Signals section in component details with value rows and "depends on" chips; *not evaluated* for computeds without a cached value.

## Acceptance
Unit tests: serialisation and diff of a small graph; a never-read computed reported as not evaluated. e2e: the demo component's computed shows its producers and flashes when a source signal changes.
