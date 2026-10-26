import { DEFAULT_SETTINGS, loadSettings, toOriginPattern } from './settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const originsList = $<HTMLUListElement>('origins');
const originInput = $<HTMLInputElement>('origin');
const headersInput = $<HTMLTextAreaElement>('headers');
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

$<HTMLFormElement>('masking').onsubmit = async (e) => {
  e.preventDefault();
  const names = headersInput.value
    .split(/[\n,]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  await chrome.storage.sync.set({ maskedHeaders: names });
  message.textContent = 'Saved masked headers.';
};

$<HTMLButtonElement>('reset-headers').onclick = async () => {
  await chrome.storage.sync.set({ maskedHeaders: DEFAULT_SETTINGS.maskedHeaders });
  await render();
};

void render();
