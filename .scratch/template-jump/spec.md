# Request-to-template jump — spec

Terms: `GLOSSARY.md` (Owner Component, Ghost Node, Instance Id). First of five "Angular-specific" features, `docs/ideas.md` #9.

## Scope
- **Reveal in Elements**: selects the Owner Component's host element in the Elements panel via `chrome.devtools.inspectedWindow.eval('inspect(el)')`. The hook exposes the element for an Instance Id. Offered in the request drawer (next to Owner Component) and in the component tree node's context menu. Disabled with the tooltip "Component destroyed" on a Ghost Node. Works in production builds.
- **Open source**: needs `ɵcmp.debugInfo.filePath` / `lineNumber` (dev builds only). Two actions:
  - **Open in Sources**: `chrome.devtools.panels.openResource(url, line - 1)`, trying candidate source-mapped URLs built from `filePath` (`webpack:///…`, `<origin>/…`, `<origin>/@fs/…`) until one opens.
  - **Open in editor**: opens a URL built from an editor template. Per origin in Options: a **project root** and an **editor**, chosen from presets (VS Code by default, VS Code Insiders, Cursor, Windsurf, Zed, WebStorm, IntelliJ IDEA, Sublime Text (needs a `subl://` handler) or Custom). Templates use `{root}`, `{file}`, `{line}`, `{column}`. Hidden when no project root is set.
  - If neither works, show `filePath:line` with a copy button.
- In production builds (no `debugInfo`) the open actions are disabled with "Needs a development build".

## Out of scope
- Jumping to a template line or a specific element inside the template; directives; Vite `/__open-in-editor` integration.
