import { describe, expect, it } from 'vitest';
import { makeRequest } from './testing';
import { detectWaste, summariseWaste } from './waste';
import type { Attribution } from './types';

const owner = (className: string | null, group: string | null = null): Attribution => ({
  instanceId: className ? 1 : null,
  className,
  confidence: className ? 'context' : 'none',
  via: 'none',
  callChain: [],
  group,
  route: null,
  service: null,
});

const at = (startTime: number, endTime: number | null, extra: Parameters<typeof makeRequest>[0] = {}) =>
  makeRequest({ startTime, endTime, ...extra });

describe('detectWaste: duplicates', () => {
  it('flags a repeat sent after the first finished, within the window', () => {
    const first = at(0, 100);
    const second = at(600, 700);
    const waste = detectWaste([first, second], 1000);
    expect(waste.get(first.id)).toBeUndefined();
    expect(waste.get(second.id)).toEqual([{ kind: 'duplicate', count: 2 }]);
  });

  it('flags a repeat sent while the first is still in flight', () => {
    const first = at(0, null);
    const second = at(50, null);
    expect(detectWaste([first, second], 1000).get(second.id)).toEqual([{ kind: 'duplicate', count: 2 }]);
  });

  it('does not flag a repeat outside the window', () => {
    const first = at(0, 100);
    const second = at(1500, 1600);
    expect(detectWaste([first, second], 1000).size).toBe(0);
  });

  it('counts a run of repeats', () => {
    const [a, b, c] = [at(0, 100), at(200, 300), at(400, 500)];
    const waste = detectWaste([a, b, c], 1000);
    expect(waste.get(b.id)).toEqual([{ kind: 'duplicate', count: 2 }]);
    expect(waste.get(c.id)).toEqual([{ kind: 'duplicate', count: 3 }]);
  });

  it('ignores the order of query parameters', () => {
    const a = at(0, 100, { url: 'http://localhost/api?a=1&b=2' });
    const b = at(200, 300, { url: 'http://localhost/api?b=2&a=1' });
    expect(detectWaste([a, b], 1000).get(b.id)).toEqual([{ kind: 'duplicate', count: 2 }]);
  });

  it('never flags non-idempotent methods', () => {
    const a = at(0, 100, { method: 'POST' });
    const b = at(200, 300, { method: 'POST' });
    expect(detectWaste([a, b], 1000).size).toBe(0);
  });

  it('does not match requests with different bodies or URLs', () => {
    const a = at(0, 100, { url: 'http://localhost/a' });
    const b = at(200, 300, { url: 'http://localhost/b' });
    const c = at(400, 500, { url: 'http://localhost/a', requestBody: { kind: 'text', text: 'x', size: 1, truncated: false } });
    expect(detectWaste([a, b, c], 1000).size).toBe(0);
  });

  it('does not count a retry after a network failure', () => {
    const failed = at(0, 100, { status: null, error: 'net::ERR_FAILED' });
    const retry = at(200, 300);
    expect(detectWaste([failed, retry], 1000).size).toBe(0);
  });

  it('never flags a Replayed Request', () => {
    const original = at(0, 100);
    const replay = at(200, 300, { replayOf: original.id });
    expect(detectWaste([original, replay], 1000).size).toBe(0);
  });
});

describe('detectWaste: cancelled then refired', () => {
  it('flags the aborted request when the same URL is sent again soon after', () => {
    const aborted = at(0, 50, { status: null, error: 'Aborted' });
    const refired = at(60, 160);
    const waste = detectWaste([aborted, refired], 1000);
    expect(waste.get(aborted.id)).toEqual([{ kind: 'cancelled' }]);
    expect(waste.get(refired.id)).toBeUndefined();
  });

  it('does not flag an abort that is not followed by the same request', () => {
    const aborted = at(0, 50, { status: null, error: 'Aborted' });
    const other = at(60, 160, { url: 'http://localhost/other' });
    expect(detectWaste([aborted, other], 1000).size).toBe(0);
  });
});

describe('summariseWaste', () => {
  it('groups by Owner Component with counts and wasted time, worst first', () => {
    const list = owner('ProductListComponent');
    const cart = owner(null, 'CartService');
    const first = at(0, 100, { attribution: list });
    const dup = at(200, 500, { attribution: list });
    const aborted = at(0, 40, { url: 'http://localhost/s', status: null, error: 'Aborted', attribution: cart });
    const refired = at(50, 90, { url: 'http://localhost/s', attribution: cart });
    const requests = [first, dup, aborted, refired];
    expect(summariseWaste(requests, detectWaste(requests, 1000))).toEqual([
      { group: 'ProductListComponent', duplicates: 1, cancelled: 0, wastedMs: 300 },
      { group: 'CartService', duplicates: 0, cancelled: 1, wastedMs: 40 },
    ]);
  });
});
