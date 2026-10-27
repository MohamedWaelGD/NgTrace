/** Isolated-world bridge: hook (window.postMessage) ↔ background (chrome.runtime). */
import {
  CONTENT_SOURCE,
  HOOK_SOURCE,
  type HookMessage,
  type RuntimeMessage,
  type WindowEnvelope,
} from '@ngtrace/protocol';

window.addEventListener('message', (event) => {
  const data = event.data as WindowEnvelope<HookMessage> | undefined;
  if (event.source !== window || data?.source !== HOOK_SOURCE) return;
  const message: RuntimeMessage = { channel: 'hook', message: data.payload };
  // No panel listening, or the extension was reloaded (throws synchronously): the hook keeps its buffer.
  try {
    chrome.runtime.sendMessage(message).catch(() => {});
  } catch {
    // Extension context invalidated.
  }
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (message.channel !== 'command') return;
  const envelope: WindowEnvelope<unknown> = { source: CONTENT_SOURCE, payload: message.command };
  window.postMessage(envelope, '*');
});
