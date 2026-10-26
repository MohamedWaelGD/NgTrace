import type { CapturedRequest, TimingPhase } from './types';

/** The subset of a `chrome.devtools.network` HAR entry that Enrichment needs. */
export interface HarLikeEntry {
  request: { url: string; method: string; headers: { name: string; value: string }[] };
  startedDateTime: string;
  time: number;
  /** HAR phase durations in ms; -1 means not available. `ssl` is part of `connect`, so it is not listed separately. */
  timings?: Partial<Record<'blocked' | 'dns' | 'connect' | 'ssl' | 'send' | 'wait' | 'receive', number>>;
}

const PHASES = ['blocked', 'dns', 'connect', 'send', 'wait', 'receive'] as const;

function phasesOf(timings: HarLikeEntry['timings']): TimingPhase[] | undefined {
  if (!timings) return undefined;
  return PHASES.flatMap((name) => ((timings[name] ?? 0) > 0 ? [{ name, ms: timings[name]! }] : []));
}

const WINDOW_MS = 2000;

/**
 * Finds the Captured Request a HAR entry belongs to (same method + URL, nearest start within 2 s,
 * un-enriched first) and returns it with Enrichment applied, or null when nothing matches.
 */
export function enrich(requests: CapturedRequest[], entry: HarLikeEntry): CapturedRequest | null {
  const at = Date.parse(entry.startedDateTime);
  const method = entry.request.method.toUpperCase();
  let best: CapturedRequest | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const r of requests) {
    if (r.method.toUpperCase() !== method || r.url !== entry.request.url) continue;
    const distance = Math.abs(r.startTime - at);
    if (distance > WINDOW_MS) continue;
    const score = distance + (r.enrichment ? WINDOW_MS * 2 : 0);
    if (score < bestScore) {
      best = r;
      bestScore = score;
    }
  }
  if (!best) return null;
  return {
    ...best,
    enrichment: {
      requestHeaders: entry.request.headers.map((h) => [h.name, h.value]),
      serverTiming: entry.time,
      phases: phasesOf(entry.timings),
    },
  };
}
