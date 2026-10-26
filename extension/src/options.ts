import { DEFAULT_SETTINGS, loadSettings, toOriginPattern } from './settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const originsList = $<HTMLUListElement>('origins');
const originInput = $<HTMLInputElement>('origin');
const headersInput = $<HTMLTextAreaElement>('headers');
const quickCopyInput = $<HTMLTextAreaElement>('quick-copy-headers');
const message = $<HTMLParagraphElement>('message');

async function render(): Promise<void> {
  const settings = await loadSettings();
  originsList.replaceChildren(
    ...settings.extraOrigins.map((origin) => {
      const li = document.createElement('li');
      li.textContent = origin + ' ';
      const remove = document.createElement('button');
      remove.textContent = 'Remove';
      remove.onclick = async () => {
        await chrome.permissions.remove({ origins: [origin] });
        await chrome.storage.sync.set({ extraOrigins: settings.extraOrigins.filter((o) => o !== origin) });
        await render();
      };
      li.appendChild(remove);
      return li;
    }),
  );
  headersInput.value = settings.maskedHeaders.join('\n');
  quickCopyInput.value = settings.quickCopyHeaders.join('\n');
}

$<HTMLFormElement>('add-origin').onsubmit = async (e) => {
  e.preventDefault();
  const pattern = toOriginPattern(originInput.value);
  if (!pattern) {
    message.textContent = 'Enter a full http(s) URL, e.g. https://staging.example.com';
    return;
  }
  // Must run in the click's user gesture.
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) {
    message.textContent = 'Permission was not granted.';
    return;
  }
  const { extraOrigins } = await loadSettings();
  await chrome.storage.sync.set({ extraOrigins: [...new Set([...extraOrigins, pattern])] });
  originInput.value = '';
  message.textContent = `Added ${pattern}. Reload that page to start capturing.`;
  await render();
};

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

void render();
