import { describe, expect, it } from 'vitest';
import { bearerToken, headerValue, latestHeaderValue } from './quick-copy';
import { makeRequest } from './testing';

describe('Quick-copy Headers', () => {
  it('finds a header by name, case-insensitively', () => {
    const r = makeRequest({ requestHeaders: [['content-type', 'application/json'], ['AUTHORIZATION', 'Bearer abc']] });
    expect(headerValue(r, 'Authorization')).toBe('Bearer abc');
    expect(headerValue(r, 'x-tenant')).toBeNull();
  });

  it('prefers the enriched request headers when present', () => {
    const r = makeRequest({
      requestHeaders: [],
      enrichment: { requestHeaders: [['authorization', 'Bearer wire']] },
    });
    expect(headerValue(r, 'Authorization')).toBe('Bearer wire');
  });

  it('strips the Bearer prefix for "token only"', () => {
    expect(bearerToken('Bearer eyJ.abc')).toBe('eyJ.abc');
    expect(bearerToken('bearer   xyz')).toBe('xyz');
    expect(bearerToken('Basic dXNlcg==')).toBeNull();
  });

  it('copies from the most recent request that carries the header', () => {
    const old = makeRequest({ startTime: 1, requestHeaders: [['Authorization', 'Bearer old']] });
    const none = makeRequest({ startTime: 3 });
    const fresh = makeRequest({ startTime: 2, requestHeaders: [['authorization', 'Bearer new']] });
    expect(latestHeaderValue([old, none, fresh], 'Authorization')).toBe('Bearer new');
    expect(latestHeaderValue([none], 'Authorization')).toBeNull();
  });
});
