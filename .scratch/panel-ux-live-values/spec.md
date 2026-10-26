# Panel UX, Live Values and Quick-copy — spec

Follow-up to `../angular-api-inspector/spec.md`. Terms: `GLOSSARY.md` (Recording, Live Values, Quick-copy Header). Decisions: `docs/adr/0005`, `docs/adr/0006`.

## Scope
- **Resizable panes**: drag splitters between tree | table | detail, and between the component tree and the details below it. Sizes stored in `localStorage` (wrapped in try/catch). Double-click a splitter to reset it. Every pane has a minimum width or height.
- **Live Values**: while Recording is on, the selected component's @Inputs and State (or the selected service's state) update after each change-detection cycle. Updates come at most every ~250 ms, and only changed entries are sent. Expanded value-tree nodes stay open and refresh. Changed rows (and their collapsed ancestors) flash for ~600 ms. If a read takes over ~8 ms, the update interval backs off to ~1 s and the Details header shows "throttled". When the component is destroyed (Ghost Node), its values freeze with the label "destroyed — last known values".
- **Recording**: the existing ● toggle covers both request capture and Live Values. While paused, ⟳ still forces a one-off read.
- **Picker scroll**: after an element is picked, the tree selects the nearest enclosing component, expands its ancestors, scrolls the row to the middle of the pane (only if it is off-screen), flashes it, and shows "from `<tag.class>`". The Elements panel's `$0` is **not** followed.
- **Icons**: Hugeicons (`@hugeicons/angular` + `@hugeicons/core-free-icons`, Stroke Rounded), bundled with the extension. They replace every glyph in the panel and add icons with tooltips to the copy and export buttons. The options page stays plain.
- **Header copy**: every request and response header row gets a copy icon on hover. It copies the raw value even when the header is masked (ADR 0006). The toast says "Copied <Name> (unmasked)" when the header was masked.
- **Quick-copy Headers**: a new options-page list (default `Authorization`, case-insensitive, stored in `chrome.storage.sync`). It adds per-header buttons in the request detail, shown only when the request has that header. It also adds a toolbar dropdown that copies the header from the **most recent** Captured Request that has it; the item is disabled with a tooltip when none has it. If the value starts with `Bearer `, a "token only" item is offered too. cURL, fetch and HAR still follow masking.
- **Store readiness**: the logo, the manifest `icons` key, the DevTools panel icon, and the Chrome Web Store listing assets.

## Out of scope
- Following the Elements panel's `$0`.
- Tracking each signal's writes individually (ADR 0005).
- Live Values for components that are not selected.
