/** Request-to-template jump: where a component's source file can be opened (DevTools Sources, or an editor). */

/** Forward slashes, no leading `./`. */
function normalisePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^(\.\/)+/, '');
}

const isAbsolute = (path: string) => path.startsWith('/') || /^[A-Za-z]:\//.test(path);

/**
 * Source-mapped URLs DevTools may know a component's file by, most likely first. `filePath` is
 * `ɵcmp.debugInfo.filePath`: workspace-relative with the Angular CLI.
 */
export function sourceUrlCandidates(origin: string, filePath: string): string[] {
  const path = normalisePath(filePath);
  if (isAbsolute(path)) return [`${origin}/@fs/${path.replace(/^\//, '')}`, `webpack:///${path.replace(/^\//, '')}`];
  return [`${origin}/${path}`, `webpack:///${path}`, `webpack:///./${path}`, `${origin}/@fs/${path}`];
}

export type EditorId = 'vscode' | 'vscode-insiders' | 'cursor' | 'windsurf' | 'zed' | 'webstorm' | 'idea' | 'sublime' | 'custom';

export interface EditorPreset {
  id: EditorId;
  label: string;
  /** URL template with `{root}`, `{file}`, `{line}` and `{column}`. */
  template: string;
  note?: string;
}

export const EDITOR_PRESETS: EditorPreset[] = [
  { id: 'vscode', label: 'VS Code', template: 'vscode://file/{root}/{file}:{line}:{column}' },
  { id: 'vscode-insiders', label: 'VS Code Insiders', template: 'vscode-insiders://file/{root}/{file}:{line}:{column}' },
  { id: 'cursor', label: 'Cursor', template: 'cursor://file/{root}/{file}:{line}:{column}' },
  { id: 'windsurf', label: 'Windsurf', template: 'windsurf://file/{root}/{file}:{line}:{column}' },
  { id: 'zed', label: 'Zed', template: 'zed://file/{root}/{file}:{line}:{column}' },
  { id: 'webstorm', label: 'WebStorm', template: 'webstorm://open?file={root}/{file}&line={line}&column={column}' },
  { id: 'idea', label: 'IntelliJ IDEA', template: 'idea://open?file={root}/{file}&line={line}&column={column}' },
  {
    id: 'sublime',
    label: 'Sublime Text',
    template: 'subl://open?url=file:///{root}/{file}&line={line}&column={column}',
    note: 'Needs a handler for subl:// URLs (e.g. the subl-handler app on macOS); Sublime Text does not register one itself.',
  },
  { id: 'custom', label: 'Custom', template: '' },
];

/** chrome.storage.sync key of an origin's EditorSettings: `editor:<origin>`. */
export const EDITOR_SETTINGS_PREFIX = 'editor:';

/** Window property where the hook puts the element to reveal, for `inspect(window.__ngapi_reveal)`. */
export const REVEAL_GLOBAL = '__ngapi_reveal';

/** Per-origin "Open in editor" settings. */
export interface EditorSettings {
  /** Absolute path of the workspace root that `debugInfo.filePath` is relative to. */
  projectRoot?: string;
  editor?: EditorId;
  /** Used when `editor` is "custom". */
  customTemplate?: string;
}

export function editorTemplate(settings: EditorSettings): string {
  if (settings.editor === 'custom') return settings.customTemplate ?? '';
  return (EDITOR_PRESETS.find((p) => p.id === settings.editor) ?? EDITOR_PRESETS[0]).template;
}

/**
 * Fills an editor URL template. Paths use forward slashes and are URL-encoded; where `{root}`
 * follows a `/` in the template, the root's own leading slash is dropped so the two join with one.
 */
export function editorUrl(template: string, at: { root: string; file: string; line: number; column: number }): string {
  const root = normalisePath(at.root).replace(/\/+$/, '');
  const file = normalisePath(at.file).replace(/^\/+/, '');
  return template
    .replace(/(\/?)\{root\}/g, (_, slash: string) => slash + encodeURI(slash ? root.replace(/^\//, '') : root))
    .replace(/\{file\}/g, encodeURI(file))
    .replace(/\{line\}/g, String(at.line))
    .replace(/\{column\}/g, String(at.column));
}
