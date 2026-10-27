import { DEFAULT_DUPLICATE_WINDOW_MS, DEFAULT_MASKED_HEADERS, DEFAULT_QUICK_COPY_HEADERS } from '@ngtrace/protocol';

export interface Settings {
  /** Header names masked on screen, in cURL / fetch copies and in HAR export (not in header copy, ADR 6). */
  maskedHeaders: string[];
  /** Request headers with one-click copy buttons (Quick-copy Headers). */
  quickCopyHeaders: string[];
  /** How long after an identical GET a repeat still counts as a Duplicate (ms). */
  duplicateWindowMs: number;
  /** Alternating row backgrounds in the request table and the component tree. */
  stripedRows: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  maskedHeaders: DEFAULT_MASKED_HEADERS,
  quickCopyHeaders: DEFAULT_QUICK_COPY_HEADERS,
  duplicateWindowMs: DEFAULT_DUPLICATE_WINDOW_MS,
  stripedRows: true,
};

export async function loadSettings(): Promise<Settings> {
  const stored = (await chrome.storage.sync.get(DEFAULT_SETTINGS as unknown as Record<string, unknown>)) as Partial<Settings>;
  return { ...DEFAULT_SETTINGS, ...stored };
}
