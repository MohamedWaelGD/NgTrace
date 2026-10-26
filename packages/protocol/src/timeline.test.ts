import { describe, expect, it } from 'vitest';
import { makeRequest } from './testing';
import { colorIndex, fitAll, fitNavigation, panViewport, placeSpan, routePhaseBands, spanOf, visibleRows, zoomViewport } from './timeline';
import type { NavEvent } from './types';

describe('spanOf', () => {
  it('uses the monotonic start when present and the duration from wall-clock times', () => {
    const r = makeRequest({ startTime: 1_000, endTime: 1_250, startMono: 5_000 });
    expect(spanOf(r, 9_999)).toEqual({ start: 5_000, end: 5_250 });
  });

  it('falls back to the wall-clock start, and runs a pending request up to now', () => {
    const r = makeRequest({ startTime: 1_000, endTime: null });
    expect(spanOf(r, 1_400)).toEqual({ start: 1_000, end: 1_400 });
  });
});

describe('fitAll', () => {
  it('covers every request with a little padding', () => {
    const a = makeRequest({ startTime: 1_000, endTime: 1_100 });
    const b = makeRequest({ startTime: 1_500, endTime: 2_000 });
    expect(fitAll([a, b], 3_000)).toEqual({ start: 950, end: 2_050 });
  });

  it('returns null when there is nothing to show', () => {
    expect(fitAll([], 0)).toBeNull();
  });
});

describe('fitNavigation', () => {
  const nav = (kind: NavEvent['kind'], at: number): NavEvent => ({ kind, url: '/x', at });

  it('spans from the last navigation start to the last request that finished after it', () => {
    const before = makeRequest({ startTime: 100, endTime: 200 });
    const during = makeRequest({ startTime: 1_100, endTime: 1_800 });
    const events = [nav('start', 0), nav('end', 150), nav('start', 1_000), nav('end', 1_300)];
    expect(fitNavigation(events, [before, during], 5_000)).toEqual({ start: 960, end: 1_840 });
  });

  it('returns null without navigation events', () => {
    expect(fitNavigation([], [], 0)).toBeNull();
  });
});

describe('zoomViewport and panViewport', () => {
  it('zooms around the anchor so the time under the cursor stays put', () => {
    expect(zoomViewport({ start: 0, end: 1_000 }, 0.5, 0.25)).toEqual({ start: 125, end: 625 });
  });

  it('never zooms below 1 ms', () => {
    const vp = zoomViewport({ start: 0, end: 2 }, 0.1, 0.5);
    expect(vp.end - vp.start).toBe(1);
  });

  it('pans by a time delta', () => {
    expect(panViewport({ start: 100, end: 200 }, -30)).toEqual({ start: 70, end: 170 });
  });
});

describe('placeSpan', () => {
  const vp = { start: 1_000, end: 2_000 };

  it('returns percentages of the viewport', () => {
    expect(placeSpan({ start: 1_250, end: 1_750 }, vp)).toEqual({ left: 25, width: 50 });
  });

  it('clips spans that overhang the viewport', () => {
    expect(placeSpan({ start: 500, end: 1_500 }, vp)).toEqual({ left: 0, width: 50 });
  });

  it('gives instant spans a minimum width and hides spans outside the viewport', () => {
    expect(placeSpan({ start: 1_500, end: 1_500 }, vp)?.width).toBeGreaterThan(0);
    expect(placeSpan({ start: 3_000, end: 3_100 }, vp)).toBeNull();
  });
});

describe('colorIndex', () => {
  it('is stable per owner and within the palette', () => {
    expect(colorIndex('CartComponent')).toBe(colorIndex('CartComponent'));
    expect(colorIndex('CartComponent')).toBeGreaterThanOrEqual(0);
    expect(colorIndex('CartComponent')).toBeLessThan(8);
  });
});

describe('visibleRows', () => {
  it('slices rows for the scroll position with overscan, clamped to the list', () => {
    expect(visibleRows({ total: 1_000, rowHeight: 20, scrollTop: 400, height: 100, overscan: 2 })).toEqual({ first: 18, last: 27 });
    expect(visibleRows({ total: 5, rowHeight: 20, scrollTop: 0, height: 400, overscan: 2 })).toEqual({ first: 0, last: 5 });
  });
});

describe('routePhaseBands', () => {
  it('pairs guard and resolve start/end events into bands', () => {
    const events: NavEvent[] = [
      { kind: 'start', url: '/s/3', at: 0 },
      { kind: 'guards-start', url: '/s/3', at: 10 },
      { kind: 'guards-end', url: '/s/3', at: 40 },
      { kind: 'resolve-start', url: '/s/3', at: 40 },
      { kind: 'resolve-end', url: '/s/3', at: 90 },
    ];
    expect(routePhaseBands(events)).toEqual([
      { phase: 'guard', url: '/s/3', start: 10, end: 40 },
      { phase: 'resolve', url: '/s/3', start: 40, end: 90 },
    ]);
  });

  it('closes an unfinished band at the cancel or error event', () => {
    const events: NavEvent[] = [
      { kind: 'resolve-start', url: '/a', at: 5 },
      { kind: 'cancel', url: '/a', at: 25 },
    ];
    expect(routePhaseBands(events)).toEqual([{ phase: 'resolve', url: '/a', start: 5, end: 25 }]);
  });
});
