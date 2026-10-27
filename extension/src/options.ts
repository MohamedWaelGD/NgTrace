import { EDITOR_PRESETS, EDITOR_SETTINGS_PREFIX, type EditorId, type EditorSettings } from '@ngtrace/protocol';
import { DEFAULT_SETTINGS, loadSettings } from './settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const headersInput = $<HTMLTextAreaElement>('headers');
const quickCopyInput = $<HTMLTextAreaElement>('quick-copy-headers');
const windowInput = $<HTMLInputElement>('duplicate-window');
const stripedInput = $<HTMLInputElement>('striped-rows');
const message = $<HTMLParagraphElement>('message');
const editorsList = $<HTMLUListElement>('editors');
const editorOrigin = $<HTMLInputElement>('editor-origin');
const editorRoot = $<HTMLInputElement>('editor-root');
const editorPreset = $<HTMLSelectElement>('editor-preset');
const editorTemplate = $<HTMLInputElement>('editor-template');
const editorNote = $<HTMLParagraphElement>('editor-note');

// The message is a toast: it clears itself a few seconds after the last change.
let messageTimer: ReturnType<typeof setTimeout> | undefined;
new MutationObserver(() => {
  clearTimeout(messageTimer);
  if (message.textContent) messageTimer = setTimeout(() => (message.textContent = ''), 3000);
}).observe(message, { childList: true, characterData: true, subtree: true });

async function render(): Promise<void> {
  const settings = await loadSettings();
  headersInput.value = settings.maskedHeaders.join('\n');
  quickCopyInput.value = settings.quickCopyHeaders.join('\n');
  windowInput.value = String(settings.duplicateWindowMs);
  stripedInput.checked = settings.stripedRows;
}

const headerNames = (text: string) =>
  text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

$<HTMLFormElement>('masking').onsubmit = async (e) => {
  e.preventDefault();
  const names = headerNames(headersInput.value).map((s) => s.toLowerCase());
  await chrome.storage.sync.set({ maskedHeaders: names });
  message.textContent = 'Saved masked headers.';
};

$<HTMLButtonElement>('reset-headers').onclick = async () => {
  await chrome.storage.sync.set({ maskedHeaders: DEFAULT_SETTINGS.maskedHeaders });
  await render();
};

$<HTMLFormElement>('quick-copy').onsubmit = async (e) => {
  e.preventDefault();
  await chrome.storage.sync.set({ quickCopyHeaders: [...new Set(headerNames(quickCopyInput.value))] });
  message.textContent = 'Saved quick-copy headers.';
};

$<HTMLButtonElement>('reset-quick-copy').onclick = async () => {
  await chrome.storage.sync.set({ quickCopyHeaders: DEFAULT_SETTINGS.quickCopyHeaders });
  await render();
};

$<HTMLFormElement>('waste').onsubmit = async (e) => {
  e.preventDefault();
  const ms = Number(windowInput.value);
  await chrome.storage.sync.set({ duplicateWindowMs: Number.isFinite(ms) && ms >= 0 ? Math.round(ms) : DEFAULT_SETTINGS.duplicateWindowMs });
  message.textContent = 'Saved duplicate window.';
};

stripedInput.onchange = async () => {
  await chrome.storage.sync.set({ stripedRows: stripedInput.checked });
  message.textContent = `Striped rows ${stripedInput.checked ? 'on' : 'off'}.`;
};

editorPreset.replaceChildren(...EDITOR_PRESETS.map((p) => new Option(p.label, p.id)));
const showPreset = () => {
  const preset = EDITOR_PRESETS.find((p) => p.id === editorPreset.value);
  editorTemplate.hidden = preset?.id !== 'custom';
  editorNote.textContent = preset?.note ?? (preset?.id === 'custom' ? 'Use {root}, {file}, {line} and {column}.' : '');
};
editorPreset.onchange = showPreset;

async function editorEntries(): Promise<[string, EditorSettings][]> {
  const all = await chrome.storage.sync.get(null);
  return Object.entries(all)
    .filter(([key]) => key.startsWith(EDITOR_SETTINGS_PREFIX))
    .map(([key, value]) => [key.slice(EDITOR_SETTINGS_PREFIX.length), value as EditorSettings]);
}

function fillEditorForm(origin: string, settings: EditorSettings): void {
  editorOrigin.value = origin;
  editorRoot.value = settings.projectRoot ?? '';
  editorPreset.value = settings.editor ?? 'vscode';
  editorTemplate.value = settings.customTemplate ?? '';
  showPreset();
}

async function renderEditors(): Promise<void> {
  const entries = await editorEntries();
  editorsList.replaceChildren(
    ...entries.map(([origin, settings]) => {
      const li = document.createElement('li');
      const label = EDITOR_PRESETS.find((p) => p.id === (settings.editor ?? 'vscode'))?.label ?? settings.editor;
      li.textContent = `${origin} → ${settings.projectRoot} (${label}) `;
      const edit = document.createElement('button');
      edit.textContent = 'Edit';
      edit.onclick = () => fillEditorForm(origin, settings);
      const remove = document.createElement('button');
      remove.textContent = 'Remove';
      remove.onclick = async () => {
        await chrome.storage.sync.remove(EDITOR_SETTINGS_PREFIX + origin);
        await renderEditors();
      };
      li.append(edit, ' ', remove);
      return li;
    }),
  );
}

$<HTMLFormElement>('editor').onsubmit = async (e) => {
  e.preventDefault();
  let origin: string;
  try {
    origin = new URL(editorOrigin.value.trim()).origin;
  } catch {
    message.textContent = 'Enter the app origin, e.g. http://localhost:4200';
    return;
  }
  const settings: EditorSettings = { projectRoot: editorRoot.value.trim(), editor: editorPreset.value as EditorId };
  if (settings.editor === 'custom') settings.customTemplate = editorTemplate.value.trim();
  if (settings.projectRoot) await chrome.storage.sync.set({ [EDITOR_SETTINGS_PREFIX + origin]: settings });
  else await chrome.storage.sync.remove(EDITOR_SETTINGS_PREFIX + origin);
  message.textContent = `Saved editor settings for ${origin}.`;
  await renderEditors();
};

fillEditorForm('', {});
void render();
void renderEditors();
