import { DEFAULT_DUPLICATE_WINDOW_MS, DEFAULT_MASKED_HEADERS, DEFAULT_QUICK_COPY_HEADERS } from '@ngapi/protocol';

export interface Settings {
  /** Origin match patterns beyond localhost, e.g. `https://staging.example.com/*`. */
  extraOrigins: string[];
  /** Header names masked on screen, in cURL / fetch copies and in HAR export (not in header copy, ADR 6). */
  maskedHeaders: string[];
  /** Request headers with one-click copy buttons (Quick-copy Headers). */
  quickCopyHeaders: string[];
  /** How long after an identical GET a repeat still counts as a Duplicate (ms). */
  duplicateWindowMs: number;
}

export const DEFAULT_SETTINGS: Settings = { extraOrigins: [], maskedHeaders: DEFAULT_MASKED_HEADERS, quickCopyHeaders: DEFAULT_QUICK_COPY_HEADERS, duplicateWindowMs: DEFAULT_DUPLICATE_WINDOW_MS };

export async function loadSettings(): Promise<Settings> {
  const stored = (await chrome.storage.sync.get(DEFAULT_SETTINGS as unknown as Record<string, unknown>)) as Partial<Settings>;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function scriptsFor(origins: string[]): chrome.scripting.RegisteredContentScript[] {
  return [
    { id: 'ngapi-hook', matches: origins, js: ['hook.js'], runAt: 'document_start', world: 'MAIN', persistAcrossSessions: true },
    { id: 'ngapi-content', matches: origins, js: ['content.js'], runAt: 'document_start', persistAcrossSessions: true },
  ];
}

/** Turns "https://staging.example.com" into the match pattern "https://staging.example.com/*". */
export function toOriginPattern(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.protocol}//${url.hostname}/*`;
  } catch {
    return null;
  }
}
