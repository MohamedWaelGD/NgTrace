# Component tree

Status: resolved

Hook walks `ng.getComponent`/`__ngContext__` from roots (multiple roots), assigns Instance Ids, sends tree; panel renders it; hover highlights element; element picker; read-only inputs; Ghost Nodes for destroyed instances.

## Comments

2026-10-26: implemented on main (initial implementation commit). Covered by unit tests and/or e2e/*.spec.ts.
