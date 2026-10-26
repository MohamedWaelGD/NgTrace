import { describe, expect, it } from 'vitest';
import { createMasker, MASK } from './export';
import { buildReplay, formatJson, groupReplays, joinUrl, needsConfirmation, replayability, splitUrl } from './replay';
import { makeRequest } from './testing';
import type { Body } from './types';

const json = (text: string, truncated = false): Body => ({ kind: 'json', text, size: text.length, truncated });

describe('replayability', () => {
  it('allows requests with no body, a text body or a form body', () => {
    expect(replayability(makeRequest(), null)).toEqual({ ok: true });
    expect(replayability(makeRequest({ requestBody: json('{}') }), null)).toEqual({ ok: true });
    expect(replayability(makeRequest({ requestBody: { kind: 'form', entries: [['a', '1']], size: 3 } }), null)).toEqual({ ok: true });
  });

  it('blocks binary and truncated bodies with a reason, unless a replacement body is supplied', () => {
    const binary = makeRequest({ requestBody: { kind: 'binary', mime: 'image/png', size: 10 } });
    const truncated = makeRequest({ requestBody: json('{"a":', true) });
    expect(replayability(binary, null)).toEqual({ ok: false, reason: 'The request body is binary and was not captured.' });
    expect(replayability(truncated, null)).toEqual({ ok: false, reason: 'The request body was truncated when captured.' });
    expect(replayability(binary, '{"a":1}')).toEqual({ ok: true });
    expect(replayability(truncated, '')).toEqual({ ok: true });
  });
});

describe('needsConfirmation', () => {
  it('asks for everything except GET and HEAD', () => {
    expect(['GET', 'head'].map(needsConfirmation)).toEqual([false, false]);
    expect(['POST', 'put', 'PATCH', 'DELETE'].map(needsConfirmation)).toEqual([true, true, true, true]);
  });
});

describe('buildReplay', () => {
  const original = makeRequest({
    id: 'p:1',
    method: 'POST',
    url: 'http://localhost/api/cart',
    requestHeaders: [['Authorization', 'Bearer real'], ['Content-Type', 'application/json']],
    requestBody: json('{"qty":1}'),
  });
  const masker = createMasker();

  it('sends masked headers with their raw value unless the user changed them', () => {
    const shown = masker.headers(original.requestHeaders);
    expect(shown[0]).toEqual(['Authorization', MASK]);
    const spec = buildReplay(original, { method: 'POST', url: original.url, headers: shown, body: '{"qty":2}' }, masker);
    expect(spec).toEqual({
      replayOf: 'p:1',
      method: 'POST',
      url: 'http://localhost/api/cart',
      headers: [['Authorization', 'Bearer real'], ['Content-Type', 'application/json']],
      body: '{"qty":2}',
    });
  });

  it('keeps an edited masked header and drops rows with an empty name', () => {
    const spec = buildReplay(
      original,
      { method: 'POST', url: original.url, headers: [['Authorization', 'Bearer other'], ['', 'ignored']], body: null },
      masker,
    );
    expect(spec.headers).toEqual([['Authorization', 'Bearer other']]);
    expect(spec.body).toBeNull();
  });

  it('never sends a body with GET or HEAD', () => {
    const spec = buildReplay(original, { method: 'get', url: original.url, headers: [], body: '{"a":1}' }, masker);
    expect(spec.method).toBe('GET');
    expect(spec.body).toBeNull();
  });
});

describe('groupReplays', () => {
  it('moves each Replayed Request directly after its original', () => {
    const a = makeRequest({ id: 'a' });
    const b = makeRequest({ id: 'b' });
    const replayA = makeRequest({ id: 'ra', replayOf: 'a' });
    const orphan = makeRequest({ id: 'rx', replayOf: 'gone' });
    expect(groupReplays([a, b, replayA, orphan]).map((r) => r.id)).toEqual(['a', 'ra', 'b', 'rx']);
  });
});

describe('splitUrl and joinUrl', () => {
  it('splits a URL into its base and ordered query rows, keeping repeated and empty values', () => {
    expect(splitUrl('http://localhost/api/s?q=a%20b&tag=1&tag=2&flag=')).toEqual({
      base: 'http://localhost/api/s',
      query: [['q', 'a b'], ['tag', '1'], ['tag', '2'], ['flag', '']],
    });
    expect(splitUrl('http://localhost/api/s')).toEqual({ base: 'http://localhost/api/s', query: [] });
  });

  it('joins the rows back, encoding values and skipping rows without a name', () => {
    expect(
      joinUrl('http://localhost/api/s', [['q', 'a b&c'], ['', 'ignored'], ['tag', '1'], ['tag', '2']]),
    ).toBe('http://localhost/api/s?q=a+b%26c&tag=1&tag=2');
    expect(joinUrl('http://localhost/api/s', [])).toBe('http://localhost/api/s');
  });

  it('round-trips a URL', () => {
    const url = 'http://localhost/api/s?a=1&b=2';
    const { base, query } = splitUrl(url);
    expect(joinUrl(base, query)).toBe(url);
  });
});

describe('formatJson', () => {
  it('pretty-prints and minifies valid JSON', () => {
    expect(formatJson('{"a":[1,2],"b":{"c":true}}', 'pretty')).toBe('{\n  "a": [\n    1,\n    2\n  ],\n  "b": {\n    "c": true\n  }\n}');
    expect(formatJson('{\n  "a": 1\n}', 'minify')).toBe('{"a":1}');
  });

  it('returns null for text that is not JSON', () => {
    expect(formatJson('{"a":', 'pretty')).toBeNull();
    expect(formatJson('', 'pretty')).toBeNull();
  });
});
