# Value History — spec

Terms: `GLOSSARY.md` (Value History, Live Values, Recording, Captured Request, Owner Component). Decisions: `docs/adr/0005`. Fifth feature, `docs/ideas.md` #8.

## Scope
- Kept in the panel from the Live Values diffs it already receives; no extra page cost. Up to 200 changes per target. Cleared when another target is selected. Frozen while Recording is paused.
- Covers what Live Values reads: the top level plus expanded paths, and signal values (`.scratch/signals-resources/`).
- A scrubber in the Details pane, with markers at the send times of Captured Requests owned by the selected component (or sent by the selected service).
- Scrubbing shows the values at that point and highlights what changed from the previous step. A "Viewing history · Back to live" bar shows while not live. Scrubbing does not pause Recording.
- Selecting a request owned by the target in the table moves the scrubber to the snapshot just before it was sent.

## Out of scope
- History for targets that were not selected; persisting history across reloads; exporting it.
