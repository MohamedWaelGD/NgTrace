import { DEFAULT_MASKED_HEADERS } from '@ngapi/protocol';

export interface Settings {
  /** Origin match patterns beyond localhost, e.g. `https://staging.example.com/*`. */
  extraOrigins: string[];
  /** Header names masked in UI, copy and export. */
  maskedHeaders: string[];
}

export const DEFAULT_SETTINGS: Settings = { extraOrigins: [], maskedHeaders: DEFAULT_MASKED_HEADERS };

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
