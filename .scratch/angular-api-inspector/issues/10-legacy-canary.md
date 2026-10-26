# Angular 14 canary demo

Status: ready-for-human

demo-app-legacy on Angular 14 running core scenarios in CI to detect debug-API drift.

## Comments

2026-10-26: not done. The Angular 14 CLI does not support Node 24, so this needs an older Node in CI (or nvm locally). Hook code paths for v14 (string `inputs` map, single-profiler `setProfiler`) are handled but unverified.
