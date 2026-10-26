import { describe, expect, it } from 'vitest';
import { enrich } from './enrich';
import { makeRequest } from './testing';

const t0 = Date.UTC(2026, 9, 26, 10, 0, 0);
const har = (url: string, method: string, at: number, headers: [string, string][] = [['Cookie', 'sid=1']]) => ({
  request: { url, method, headers: headers.map(([name, value]) => ({ name, value })) },
  startedDateTime: new Date(at).toISOString(),
  time: 42,
});

describe('enrich', () => {
  it('merges browser headers into the Captured Request with same method, URL and nearest start', () => {
    const a = makeRequest({ url: 'http://x/api', startTime: t0 });
    const b = makeRequest({ url: 'http://x/api', startTime: t0 + 1500 });
    const result = enrich([a, b], har('http://x/api', 'GET', t0 + 1400));
    expect(result?.id).toBe(b.id);
    expect(result?.enrichment).toEqual({ requestHeaders: [['Cookie', 'sid=1']], serverTiming: 42 });
  });

  it('prefers requests that are not yet enriched', () => {
    const a = makeRequest({ url: 'http://x/api', startTime: t0, enrichment: { requestHeaders: [] } });
    const b = makeRequest({ url: 'http://x/api', startTime: t0 + 500 });
    expect(enrich([a, b], har('http://x/api', 'GET', t0))?.id).toBe(b.id);
  });

  it('ignores different methods, URLs, and starts more than 2s apart', () => {
    const a = makeRequest({ url: 'http://x/api', method: 'POST', startTime: t0 });
    const b = makeRequest({ url: 'http://x/other', startTime: t0 });
    const c = makeRequest({ url: 'http://x/api', startTime: t0 + 2500 });
    expect(enrich([a, b, c], har('http://x/api', 'GET', t0))).toBeNull();
  });

  it('matches a relative URL captured by the hook against the absolute HAR URL', () => {
    const a = makeRequest({ url: 'http://x/api?q=1', startTime: t0 });
    expect(enrich([a], har('http://x/api?q=1', 'GET', t0))?.id).toBe(a.id);
  });
});
