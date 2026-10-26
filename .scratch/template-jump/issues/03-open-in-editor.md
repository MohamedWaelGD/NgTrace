# Open in editor with per-origin project root and editor presets

Status: ready-for-agent
Blocked by: 02

## What
Protocol: editor presets (VS Code default, VS Code Insiders, Cursor, Windsurf, Zed, WebStorm, IntelliJ IDEA, Sublime Text, Custom) and a pure `editorUrl(template, {root, file, line, column})` that joins paths with forward slashes and encodes them. Settings: per-origin `projectRoot` and `editor` (preset id or custom template). Options page: a section to set them, with the Sublime note about its `subl://` handler. Panel: "Open in editor" next to "Open in Sources", hidden without a project root; opens the URL with `chrome.tabs.create` / `window.open`.

## Acceptance
Unit tests: each preset renders the expected URL for a Windows and a POSIX root. e2e: with a root set in settings, the button appears and builds the VS Code URL.
