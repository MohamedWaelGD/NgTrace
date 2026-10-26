import type { CapturedRequest, NavEvent } from './types';

/** A time range in the Timeline's monotonic epoch (ms). */
export interface Span {
  start: number;
  end: number;
}
export type Viewport = Span;

export interface RouteBand {
  phase: 'guard' | 'resolve';
  url: string;
  start: number;
  end: number;
}

const PADDING = 0.05;
const MIN_WIDTH_PERCENT = 0.3;
export const PALETTE_SIZE = 8;

/** Where a request sits on the time axis: monotonic start (wall-clock when unknown) plus its duration. */
export function spanOf(r: CapturedRequest, now: number): Span {
  const start = r.startMono ?? r.startTime;
  const end = r.endTime === null ? Math.max(start, now) : start + Math.max(0, r.endTime - r.startTime);
  return { start, end };
}

const pad = (start: number, end: number): Viewport => {
  const margin = (end - start) * PADDING;
  return { start: start - margin, end: end + margin };
};

/** Viewport that shows every request, or null when there are none. */
export function fitAll(requests: CapturedRequest[], now: number): Viewport | null {
  if (!requests.length) return null;
  const spans = requests.map((r) => spanOf(r, now));
  return pad(Math.min(...spans.map((s) => s.start)), Math.max(...spans.map((s) => s.end)));
}

/** Viewport for the latest navigation: from its start to when it ended and its requests finished. */
export function fitNavigation(events: NavEvent[], requests: CapturedRequest[], now: number): Viewport | null {
  const startIndex = events.map((e) => e.kind).lastIndexOf('start');
  if (startIndex === -1) return null;
  const start = events[startIndex].at;
  const closing = events.slice(startIndex + 1).find((e) => e.kind === 'end' || e.kind === 'cancel' || e.kind === 'error');
  let end = closing?.at ?? now;
  for (const r of requests) {
    const span = spanOf(r, now);
    if (span.end >= start && span.start <= end) end = Math.max(end, span.end);
  }
  return pad(start, end);
}

/** Scales the viewport by `factor` (<1 zooms in), keeping the time at `anchor` (0..1 across the viewport) fixed. */
export function zoomViewport(vp: Viewport, factor: number, anchor: number): Viewport {
  const width = Math.max(1, (vp.end - vp.start) * factor);
  const pivot = vp.start + anchor * (vp.end - vp.start);
  const start = pivot - anchor * width;
  return { start, end: start + width };
}

export function panViewport(vp: Viewport, deltaMs: number): Viewport {
  return { start: vp.start + deltaMs, end: vp.end + deltaMs };
}

/** Horizontal placement as percentages of the viewport, clipped to it; null when entirely outside. */
export function placeSpan(span: Span, vp: Viewport): { left: number; width: number } | null {
  if (span.end < vp.start || span.start > vp.end) return null;
  const total = vp.end - vp.start;
  const left = (Math.max(span.start, vp.start) - vp.start) / total * 100;
  const right = (Math.min(span.end, vp.end) - vp.start) / total * 100;
  return { left, width: Math.max(MIN_WIDTH_PERCENT, right - left) };
}

/** Stable palette slot for an Owner Component (or group) name. */
export function colorIndex(owner: string): number {
  let hash = 0;
  for (let i = 0; i < owner.length; i++) hash = (hash * 31 + owner.charCodeAt(i)) >>> 0;
  return hash % PALETTE_SIZE;
}

/** Row range `[first, last)` to render for a scroll position. */
export function visibleRows(o: { total: number; rowHeight: number; scrollTop: number; height: number; overscan: number }): { first: number; last: number } {
  const first = Math.max(0, Math.floor(o.scrollTop / o.rowHeight) - o.overscan);
  const last = Math.min(o.total, Math.ceil((o.scrollTop + o.height) / o.rowHeight) + o.overscan);
  return { first, last };
}

/** Route Phase windows (guards, resolvers) from router events; an unfinished one closes at cancel/error. */
export function routePhaseBands(events: NavEvent[]): RouteBand[] {
  const bands: RouteBand[] = [];
  const open = new Map<string, { phase: RouteBand['phase']; start: number }>();
  for (const e of events) {
    const key = (phase: string) => `${phase}\u0000${e.url}`;
    switch (e.kind) {
      case 'guards-start':
        open.set(key('guard'), { phase: 'guard', start: e.at });
        break;
      case 'resolve-start':
        open.set(key('resolve'), { phase: 'resolve', start: e.at });
        break;
      case 'guards-end':
      case 'resolve-end': {
        const phase = e.kind === 'guards-end' ? 'guard' : 'resolve';
        const begun = open.get(key(phase));
        if (begun) bands.push({ phase, url: e.url, start: begun.start, end: e.at });
        open.delete(key(phase));
        break;
      }
      case 'cancel':
      case 'error':
        for (const [k, begun] of open) if (k.endsWith(`\u0000${e.url}`)) bands.push({ phase: begun.phase, url: e.url, start: begun.start, end: e.at });
        for (const k of [...open.keys()]) if (k.endsWith(`\u0000${e.url}`)) open.delete(k);
        break;
    }
  }
  return bands;
}

/** Start of the first request, the origin the axis counts from; null without requests. */
export function earliestStart(requests: CapturedRequest[], now: number): number | null {
  return requests.length ? Math.min(...requests.map((r) => spanOf(r, now).start)) : null;
}

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
}

function formatOffset(ms: number): string {
  const sign = ms < 0 ? '-' : '+';
  const abs = Math.abs(ms);
  if (abs < 1000) return `${sign}${Math.round(abs)} ms`;
  if (abs < 60_000) return `${sign}${Number((abs / 1000).toFixed(2))} s`;
  const minutes = Math.floor(abs / 60_000);
  const seconds = Math.round((abs % 60_000) / 1000);
  return seconds ? `${sign}${minutes} min ${seconds} s` : `${sign}${minutes} min`;
}

/**
 * Axis ticks at round offsets from `origin` (the first request), so labels slide as the viewport pans
 * instead of always starting at +0.
 */
export function axisTicks(vp: Viewport, origin: number, target = 6): { left: number; label: string }[] {
  const width = vp.end - vp.start;
  if (width <= 0) return [];
  const step = niceStep(width / target);
  const ticks: { left: number; label: string }[] = [];
  for (let k = Math.ceil((vp.start - origin) / step); origin + k * step <= vp.end; k++) {
    const at = origin + k * step;
    ticks.push({ left: ((at - vp.start) * 100) / width, label: formatOffset(at - origin) });
  }
  return ticks;
}

/** Scrollbar thumb for a viewport inside the whole range, as percentages. */
export function thumbOf(total: Viewport, vp: Viewport): { left: number; width: number } {
  const whole = total.end - total.start;
  if (whole <= 0) return { left: 0, width: 100 };
  const width = Math.min(100, Math.max(2, ((vp.end - vp.start) * 100) / whole));
  const left = Math.min(100 - width, Math.max(0, ((vp.start - total.start) * 100) / whole));
  return { left, width };
}

/** Shifts a viewport back inside the whole range, keeping its width. */
export function clampViewport(vp: Viewport, total: Viewport): Viewport {
  const width = vp.end - vp.start;
  if (width >= total.end - total.start) return total;
  const start = Math.min(total.end - width, Math.max(total.start, vp.start));
  return { start, end: start + width };
}
