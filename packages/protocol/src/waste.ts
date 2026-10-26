import type { Body, CapturedRequest } from './types';

export type WasteSignal = { kind: 'duplicate'; count: number } | { kind: 'cancelled' };

export interface WasteSummary {
  group: string;
  duplicates: number;
  cancelled: number;
  wastedMs: number;
}

export const DEFAULT_DUPLICATE_WINDOW_MS = 1000;

const IDEMPOTENT = new Set(['GET', 'HEAD']);
const isAborted = (r: CapturedRequest) => r.error !== null && /abort/i.test(r.error);
const isFailed = (r: CapturedRequest) => r.error !== null && !isAborted(r);

/** Finds Waste Signals (Duplicate, Cancelled-then-refired) in Captured Requests; Replayed Requests, Retries and requests an interceptor answered are ignored. */
export function detectWaste(requests: CapturedRequest[], windowMs: number): Map<string, WasteSignal[]> {
  // A Retry repeats a failed attempt on purpose, and an interceptor's cache hit never reached the network: never Waste.
  const sorted = requests.filter((r) => !r.replayOf && !r.shortCircuitedBy && (r.attempt ?? 1) <= 1).sort((a, b) => a.startTime - b.startTime);
  const result = new Map<string, WasteSignal[]>();
  const add = (id: string, signal: WasteSignal) => result.set(id, [...(result.get(id) ?? []), signal]);

  const sent = new Map<string, CapturedRequest[]>();
  for (const r of sorted) {
    if (IDEMPOTENT.has(r.method.toUpperCase())) {
      const key = duplicateKey(r);
      const earlier = (sent.get(key) ?? []).filter((e) => !isFailed(e) && !isAborted(e) && withinWindow(e, r, windowMs));
      if (earlier.length) add(r.id, { kind: 'duplicate', count: earlier.length + 1 });
      sent.set(key, [...(sent.get(key) ?? []), r]);
    }
    if (isAborted(r)) {
      const refired = sorted.some((o) => o !== r && o.startTime >= r.startTime && o.method === r.method && normaliseUrl(o.url) === normaliseUrl(r.url) && !isAborted(o) && o.startTime - (r.endTime ?? r.startTime) <= windowMs);
      if (refired) add(r.id, { kind: 'cancelled' });
    }
  }
  return result;
}

/** Totals per Owner Component (or the Unattributed group), worst wasted time first. */
export function summariseWaste(requests: CapturedRequest[], waste: Map<string, WasteSignal[]>): WasteSummary[] {
  const groups = new Map<string, WasteSummary>();
  for (const r of requests) {
    const signals = waste.get(r.id);
    if (!signals) continue;
    const group = r.attribution.className ?? r.attribution.group ?? 'Unattributed';
    const entry = groups.get(group) ?? { group, duplicates: 0, cancelled: 0, wastedMs: 0 };
    for (const s of signals) {
      if (s.kind === 'duplicate') entry.duplicates++;
      else entry.cancelled++;
    }
    entry.wastedMs += r.endTime === null ? 0 : r.endTime - r.startTime;
    groups.set(group, entry);
  }
  return [...groups.values()].sort((a, b) => b.wastedMs - a.wastedMs);
}

function withinWindow(earlier: CapturedRequest, later: CapturedRequest, windowMs: number): boolean {
  return earlier.endTime === null || later.startTime - earlier.endTime <= windowMs;
}

function duplicateKey(r: CapturedRequest): string {
  return `${r.method.toUpperCase()} ${normaliseUrl(r.url)} ${bodyKey(r.requestBody)}`;
}

export function normaliseUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.sort();
    return u.href;
  } catch {
    return url;
  }
}

function bodyKey(body: Body): string {
  switch (body.kind) {
    case 'none':
      return '';
    case 'json':
    case 'text':
      return body.text;
    case 'form':
      return JSON.stringify(body.entries);
    case 'binary':
      return `binary:${body.size ?? ''}`;
  }
}
