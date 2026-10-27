/** Service worker: routes hook messages to the panel of the same tab, and panel commands to the tab. */
import type { PanelCommand, RuntimeMessage } from '@ngtrace/protocol';

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
    if (panels.get(tabId) !== port) return;
    panels.delete(tabId);
    // The panel closed: stop applying Mock Rules at once (the hook also drops them when heartbeats stop).
    const message: RuntimeMessage = { channel: 'command', tabId, command: { type: 'mock-disarm' } };
    chrome.tabs.sendMessage(tabId, message).catch(() => {});
  });
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender) => {
  const tabId = sender.tab?.id;
  if (message.channel !== 'hook' || tabId === undefined || sender.frameId !== 0) return;
  panels.get(tabId)?.postMessage(message.message);
});

/** The manifest now injects on every http(s) page; drop scripts an older version registered per origin, or they would inject twice. */
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.scripting.getRegisteredContentScripts();
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
  await chrome.storage.sync.remove('extraOrigins');
});
