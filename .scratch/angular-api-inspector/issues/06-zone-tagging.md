# Zone.js context attribution

Status: resolved

Wrap lifecycle hooks + listeners of discovered instances in a child zone carrying the Instance Id; requests inside get confidence zone. Demo scenarios: debounceTime search, route-param switchMap, setTimeout.

## Comments

2026-10-26: implemented on main (initial implementation commit). Covered by unit tests and/or e2e/*.spec.ts.
