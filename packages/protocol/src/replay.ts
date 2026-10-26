import { MASK, type Masker } from './export';
import type { CapturedRequest, Header, ReplaySpec } from './types';

/** What the user edited in "Edit & resend". Header values may still be the on-screen mask. */
export interface ReplayEdits {
  method: string;
  url: string;
  headers: Header[];
  /** null: no body. */
  body: string | null;
}

export type Replayability = { ok: true } | { ok: false; reason: string };

/** Binary and truncated bodies were not captured whole, so they cannot be re-sent unless the user supplies a body. */
export function replayability(r: CapturedRequest, replacementBody: string | null): Replayability {
  if (replacementBody !== null) return { ok: true };
  if (r.requestBody.kind === 'binary') return { ok: false, reason: 'The request body is binary and was not captured.' };
  if ((r.requestBody.kind === 'json' || r.requestBody.kind === 'text') && r.requestBody.truncated) {
    return { ok: false, reason: 'The request body was truncated when captured.' };
  }
  return { ok: true };
}

/** Replaying anything but GET/HEAD can change real data, so the panel asks first. */
export function needsConfirmation(method: string): boolean {
  return !['GET', 'HEAD'].includes(method.toUpperCase());
}

/**
 * Turns the edits into what the hook sends. A masked header still showing the mask is sent with its
 * original raw value (ADR 6: masking is a display concern); an edited value is sent as typed.
 */
export function buildReplay(original: CapturedRequest, edits: ReplayEdits, masker: Masker): ReplaySpec {
  const method = edits.method.trim().toUpperCase();
  const headers: Header[] = [];
  for (const [name, value] of edits.headers) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    if (value === MASK && masker.isMasked(trimmed)) {
      const raw = original.requestHeaders.find(([n]) => n.toLowerCase() === trimmed.toLowerCase());
      if (raw) headers.push([trimmed, raw[1]]);
      continue;
    }
    headers.push([trimmed, value]);
  }
  return {
    replayOf: original.id,
    method,
    url: edits.url.trim(),
    headers,
    body: method === 'GET' || method === 'HEAD' ? null : edits.body,
  };
}

/** Puts each Replayed Request directly after the request it was re-sent from. Orphans keep their place. */
export function groupReplays(requests: CapturedRequest[]): CapturedRequest[] {
  const ids = new Set(requests.map((r) => r.id));
  const replays = new Map<string, CapturedRequest[]>();
  for (const r of requests) {
    if (r.replayOf && ids.has(r.replayOf)) replays.set(r.replayOf, [...(replays.get(r.replayOf) ?? []), r]);
  }
  const grouped: CapturedRequest[] = [];
  const place = (r: CapturedRequest) => {
    grouped.push(r);
    for (const replay of replays.get(r.id) ?? []) place(replay);
  };
  for (const r of requests) if (!(r.replayOf && ids.has(r.replayOf))) place(r);
  return grouped;
}
