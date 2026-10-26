import { describe, expect, it } from 'vitest';
import { isFailed, retryChains, summariseFailures } from './failures';
import { makeRequest } from './testing';
import { detectWaste } from './waste';
import type { Attribution } from './types';

const owner = (className: string | null, service: string | null = null): Attribution => ({
  instanceId: className ? 1 : null,
  className,
  confidence: className ? 'context' : 'none',
  via: 'none',
  callChain: [],
  group: null,
  route: null,
  service,
});

describe('isFailed', () => {
  it('counts 4xx, 5xx and network errors', () => {
    expect(isFailed(makeRequest({ status: 404 }))).toBe(true);
    expect(isFailed(makeRequest({ status: 500 }))).toBe(true);
    expect(isFailed(makeRequest({ status: null, error: 'Network error' }))).toBe(true);
  });

  it('does not count successes, pending or aborted requests', () => {
    expect(isFailed(makeRequest({ status: 200 }))).toBe(false);
    expect(isFailed(makeRequest({ status: 304 }))).toBe(false);
    expect(isFailed(makeRequest({ status: null, error: null, endTime: null }))).toBe(false);
    expect(isFailed(makeRequest({ status: null, error: 'Aborted' }))).toBe(false);
    expect(isFailed(makeRequest({ status: null, error: 'AbortError: The user aborted a request.' }))).toBe(false);
  });

  it('counts a mocked failure', () => {
    expect(isFailed(makeRequest({ status: 503, mocked: true }))).toBe(true);
    expect(isFailed(makeRequest({ status: null, error: 'TypeError: Failed to fetch (mocked)', mocked: true }))).toBe(true);
  });
});

describe('retryChains', () => {
  it('links every attempt to the first and marks a chain whose last attempt succeeded as recovered', () => {
    const first = makeRequest({ status: 500, attempt: 1 });
    const second = makeRequest({ status: 500, retryOf: first.id, attempt: 2 });
    const third = makeRequest({ status: 200, retryOf: first.id, attempt: 3 });
    const chains = retryChains([third, first, second]);
    const chain = chains.get(first.id)!;
    expect(chain.attempts.map((r) => r.id)).toEqual([first.id, second.id, third.id]);
    expect(chain.recovered).toBe(true);
    expect(chains.get(third.id)).toBe(chain);
  });

  it('is not recovered while the last attempt failed or is pending', () => {
    const first = makeRequest({ status: 500, attempt: 1 });
    const failed = makeRequest({ status: 502, retryOf: first.id, attempt: 2 });
    expect(retryChains([first, failed]).get(first.id)!.recovered).toBe(false);
    const pending = makeRequest({ status: null, endTime: null, retryOf: first.id, attempt: 2 });
    expect(retryChains([first, pending]).get(first.id)!.recovered).toBe(false);
  });

  it('has no chain for a request that was never retried', () => {
    const only = makeRequest({ status: 500, attempt: 1 });
    expect(retryChains([only]).size).toBe(0);
  });

  it('keeps a chain whose first attempt was evicted', () => {
    const second = makeRequest({ status: 200, retryOf: 'gone:1', attempt: 2 });
    const chain = retryChains([second]).get(second.id)!;
    expect(chain.rootId).toBe('gone:1');
    expect(chain.attempts).toEqual([second]);
  });
});

describe('Retries are not Waste', () => {
  it('never flags a Retry as a Duplicate', () => {
    const first = makeRequest({ status: 500, startTime: 0, endTime: 10, attempt: 1 });
    const retry = makeRequest({ status: 200, startTime: 20, endTime: 30, retryOf: first.id, attempt: 2 });
    expect(detectWaste([first, retry], 1000).size).toBe(0);
  });
});

describe('summariseFailures', () => {
  it('groups by Owner Component, and Unattributed requests by Owner Service', () => {
    const a = makeRequest({ status: 500, attribution: owner('CartComponent') });
    const b = makeRequest({ status: 404, attribution: owner('CartComponent') });
    const c = makeRequest({ status: 500, attribution: owner(null, 'ConfigService') });
    const d = makeRequest({ status: null, error: 'Network error', attribution: owner(null) });
    const ok = makeRequest({ status: 200, attribution: owner('CartComponent') });
    const summary = summariseFailures([a, b, c, d, ok]);
    expect(summary).toEqual([
      { group: 'CartComponent', kind: 'component', failed: 2, retries: 0, recovered: 0 },
      { group: 'ConfigService', kind: 'service', failed: 1, retries: 0, recovered: 0 },
      { group: 'Unattributed', kind: 'unattributed', failed: 1, retries: 0, recovered: 0 },
    ]);
  });

  it('counts Retries and recovered chains of the group', () => {
    const first = makeRequest({ status: 500, attempt: 1, attribution: owner('ProductListComponent') });
    const retry = makeRequest({ status: 200, retryOf: first.id, attempt: 2, attribution: owner('ProductListComponent') });
    expect(summariseFailures([first, retry])).toEqual([
      { group: 'ProductListComponent', kind: 'component', failed: 1, retries: 1, recovered: 1 },
    ]);
  });
});
