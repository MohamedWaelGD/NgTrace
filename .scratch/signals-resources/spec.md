# Signals and HttpResource support — spec

Terms: `GLOSSARY.md` (Owner Resource, Owner Component, Live Values, Call Chain, Attribution Confidence). Decisions: `docs/adr/0005`, `docs/adr/0009`. Fourth feature, `docs/ideas.md` #5.

## Scope
- **Owner Resource**: when the profiler first sees a component instance (`TemplateCreate`), the hook scans its own fields for `resource()` / `httpResource()` / `rxResource()` objects and wraps each `loaderFn`. A request sent while the loader runs gets the Owner Resource (debug name, else field name, e.g. `ProductDetailComponent.product`) and the component as Owner Component, at `context` confidence.
- Requests from resource loaders not found this way (services, resources created later) stay Unattributed with a "resource loader" Call Chain step, detected from `loadEffect` / `HttpResourceImpl` frames.
- `toSignal` is not an owner; it appears in the Call Chain only.
- **Signals in Live Values**: for the selected component, read `ng.ɵgetSignalGraph(injector)` after change detection (same throttle as ADR 0005). Show signal, computed and linkedSignal values, and "depends on" chips for computed and effect nodes; clicking a chip scrolls to that producer. A computed with no cached value shows *not evaluated*; never force evaluation. No graph drawing in v1.
- UI: Owner Resource in the drawer, as a filter facet, and as a badge under its component in the tree.
- Production builds: signals section and Owner Resource disabled with "Needs a development build".

## Out of scope
- Resources held by services; signal graph for services; graph visualisation; writing signal values from the panel.
