/** Service worker: routes hook messages to the panel of the same tab, and panel commands to the tab. */
import type { PanelCommand, RuntimeMessage } from '@ngapi/protocol';
import { loadSettings, scriptsFor } from './settings';

const panels = new Map<number, chrome.runtime.Port>();

chrome.runtime.onConnect.addListener((port) => {
  const match = /^panel:(\d+)$/.exec(port.name);
  if (!match) return;
  const tabId = Number(match[1]);
  panels.set(tabId, port);
  port.onMessage.addListener((command: PanelCommand) => {
    const message: RuntimeMessage = { channel: 'command', tabId, command };
    chrome.tabs.sendMessage(tabId, message).catch(() => {});
  });
  port.onDisconnect.addListener(() => {
    if (panels.get(tabId) === port) panels.delete(tabId);
  });
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender) => {
  const tabId = sender.tab?.id;
  if (message.channel !== 'hook' || tabId === undefined || sender.frameId !== 0) return;
  panels.get(tabId)?.postMessage(message.message);
});

/** Registers the hook + bridge on the extra origins chosen in options (optional host permissions). */
async function syncExtraOrigins(): Promise<void> {
  const { extraOrigins } = await loadSettings();
  const granted = (await chrome.permissions.getAll()).origins ?? [];
  const origins = extraOrigins.filter((o) => granted.includes(o));
  const existing = await chrome.scripting.getRegisteredContentScripts();
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
  if (origins.length) await chrome.scripting.registerContentScripts(scriptsFor(origins));
}

chrome.runtime.onInstalled.addListener(() => void syncExtraOrigins());
chrome.runtime.onStartup.addListener(() => void syncExtraOrigins());
chrome.storage.onChanged.addListener((changes) => {
  if (changes['extraOrigins']) void syncExtraOrigins();
});
chrome.permissions.onAdded.addListener(() => void syncExtraOrigins());
chrome.permissions.onRemoved.addListener(() => void syncExtraOrigins());
