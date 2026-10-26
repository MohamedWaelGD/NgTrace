# Request timeline — spec

Terms: `GLOSSARY.md` (Timeline, Route Phase, Enrichment). Second feature, `docs/ideas.md` #4.

## Scope
- The hook adds a monotonic `startMono` (`performance.now()`) to each Captured Request and records a bounded list (200) of timestamped router events (NavigationStart, Guards/Resolve start/end, NavigationEnd/Cancel/Error with URL), sent to the panel like requests.
- Panel "Timeline" view toggle beside the table, sharing selection and filters. DOM rows (virtualised), bars coloured by Owner Component, HAR phases when enriched, navigation markers and Route Phase bands, wheel zoom, drag pan, "fit to current navigation".

## Out of scope
- Export of the timeline, canvas rendering.
