import { describe, expect, it } from 'vitest';
import { NavLog, navigationEventOf } from './nav-log';

describe('navigationEventOf', () => {
  it('maps Angular router events to timeline events', () => {
    expect(navigationEventOf({ type: 0, url: '/shop' }, 10)).toEqual({ kind: 'start', url: '/shop', at: 10 });
    expect(navigationEventOf({ type: 7, url: '/stores/3' }, 20)).toEqual({ kind: 'guards-start', url: '/stores/3', at: 20 });
    expect(navigationEventOf({ type: 8, url: '/stores/3' }, 30)).toEqual({ kind: 'guards-end', url: '/stores/3', at: 30 });
    expect(navigationEventOf({ type: 5, url: '/stores/3' }, 40)).toEqual({ kind: 'resolve-start', url: '/stores/3', at: 40 });
    expect(navigationEventOf({ type: 6, url: '/stores/3' }, 50)).toEqual({ kind: 'resolve-end', url: '/stores/3', at: 50 });
    expect(navigationEventOf({ type: 1, url: '/a', urlAfterRedirects: '/b' }, 60)).toEqual({ kind: 'end', url: '/b', at: 60 });
    expect(navigationEventOf({ type: 2, url: '/a' }, 70)).toEqual({ kind: 'cancel', url: '/a', at: 70 });
    expect(navigationEventOf({ type: 3, url: '/a' }, 80)).toEqual({ kind: 'error', url: '/a', at: 80 });
  });

  it('ignores router events the timeline does not show', () => {
    expect(navigationEventOf({ type: 4, url: '/a' }, 1)).toBeNull();
    expect(navigationEventOf(null, 1)).toBeNull();
  });
});

describe('NavLog', () => {
  it('keeps events in order and drops the oldest past the cap', () => {
    const log = new NavLog(3);
    for (let at = 1; at <= 5; at++) log.add({ kind: 'start', url: `/${at}`, at });
    expect(log.all().map((e) => e.at)).toEqual([3, 4, 5]);
  });

  it('can be cleared', () => {
    const log = new NavLog(3);
    log.add({ kind: 'start', url: '/', at: 1 });
    log.clear();
    expect(log.all()).toEqual([]);
  });
});
