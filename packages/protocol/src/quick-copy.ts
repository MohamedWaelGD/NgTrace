import type { CapturedRequest } from './types';

/** Quick-copy Headers (ADR 6): always the raw value, never masked. */

export const DEFAULT_QUICK_COPY_HEADERS = ['Authorization'];

/** A request header's value as sent (enriched headers when DevTools saw the request), case-insensitive. */
export function headerValue(r: CapturedRequest, name: string): string | null {
  const headers = r.enrichment?.requestHeaders.length ? r.enrichment.requestHeaders : r.requestHeaders;
  const wanted = name.toLowerCase();
  return headers.find(([n]) => n.toLowerCase() === wanted)?.[1] ?? null;
}

/** The token of a `Bearer <token>` value, or null for other schemes. */
export function bearerToken(value: string): string | null {
  return /^bearer\s+(.+)$/i.exec(value.trim())?.[1] ?? null;
}

/** The header's value on the most recently started request that carries it. */
export function latestHeaderValue(requests: readonly CapturedRequest[], name: string): string | null {
  let best: { at: number; value: string } | null = null;
  for (const r of requests) {
    const value = headerValue(r, name);
    if (value !== null && (!best || r.startTime >= best.at)) best = { at: r.startTime, value };
  }
  return best?.value ?? null;
}
