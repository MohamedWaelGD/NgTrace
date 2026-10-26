import { describe, expect, it } from 'vitest';
import { makeRequest } from './testing';
import {
  axisTicks,
  clampViewport,
  colorIndex,
  earliestStart,
  fitAll,
  fitNavigation,
  panViewport,
  placeSpan,
  routePhaseBands,
  spanOf,
  thumbOf,
  visibleRows,
  zoomViewport,
} from './timeline';
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

describe('axisTicks', () => {
  it('places ticks at round offsets from the origin', () => {
    const ticks = axisTicks({ start: 1_000, end: 2_000 }, 1_000);
    expect(ticks.map((t) => t.label)).toEqual(['+0 ms', '+200 ms', '+400 ms', '+600 ms', '+800 ms', '+1 s']);
    expect(ticks.map((t) => t.left)).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it('slides the labels when the viewport pans, so movement is visible', () => {
    const ticks = axisTicks({ start: 1_100, end: 2_100 }, 1_000);
    expect(ticks.map((t) => t.label)).toEqual(['+200 ms', '+400 ms', '+600 ms', '+800 ms', '+1 s']);
    expect(ticks[0].left).toBeCloseTo(10);
  });

  it('uses seconds for long ranges', () => {
    const ticks = axisTicks({ start: 0, end: 60_000 }, 0);
    expect(ticks.map((t) => t.label)).toEqual(['+0 ms', '+10 s', '+20 s', '+30 s', '+40 s', '+50 s', '+1 min']);
  });
});

describe('thumbOf and clampViewport', () => {
  const total = { start: 0, end: 1_000 };

  it('sizes and places the scrollbar thumb as percentages of the whole range', () => {
    expect(thumbOf(total, { start: 250, end: 500 })).toEqual({ left: 25, width: 25 });
    expect(thumbOf(total, total)).toEqual({ left: 0, width: 100 });
  });

  it('keeps a viewport inside the whole range, preserving its width', () => {
    expect(clampViewport({ start: -100, end: 200 }, total)).toEqual({ start: 0, end: 300 });
    expect(clampViewport({ start: 900, end: 1_200 }, total)).toEqual({ start: 700, end: 1_000 });
    expect(clampViewport({ start: -50, end: 2_000 }, total)).toEqual(total);
  });
});

describe('earliestStart', () => {
  it('is the first request start, or null without requests', () => {
    expect(earliestStart([makeRequest({ startTime: 500 }), makeRequest({ startTime: 300, startMono: 9_000 })], 0)).toBe(500);
    expect(earliestStart([], 0)).toBeNull();
  });
});
