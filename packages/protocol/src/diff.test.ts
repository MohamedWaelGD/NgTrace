import { describe, expect, it } from 'vitest';
import { diffResponses } from './diff';
import { makeRequest } from './testing';
import type { Body } from './types';

const json = (text: string): Body => ({ kind: 'json', text, size: text.length, truncated: false });
const plain = (text: string): Body => ({ kind: 'text', text, size: text.length, truncated: false });
const res = (overrides: Parameters<typeof makeRequest>[0]) => makeRequest(overrides);

describe('diffResponses: status', () => {
  it('reports a changed status and nothing when equal', () => {
    expect(diffResponses(res({ status: 200 }), res({ status: 500 })).status).toEqual({ from: 200, to: 500 });
    expect(diffResponses(res({ status: 200 }), res({ status: 200 })).status).toBeNull();
  });
});

describe('diffResponses: headers', () => {
  it('reports added, removed and changed headers, matching names case-insensitively', () => {
    const a = res({ responseHeaders: [['Content-Type', 'a'], ['X-Gone', '1'], ['ETag', '1']] });
    const b = res({ responseHeaders: [['content-type', 'a'], ['x-new', '2'], ['etag', '2']] });
    expect(diffResponses(a, b).headers).toEqual([
      { name: 'x-gone', change: 'removed', from: '1' },
      { name: 'etag', change: 'changed', from: '1', to: '2' },
      { name: 'x-new', change: 'added', to: '2' },
    ]);
  });
});

describe('diffResponses: JSON body', () => {
  it('lists changed, added and removed paths', () => {
    const a = res({ responseBody: json('{"id":1,"name":"Hat","tags":["a","b"],"old":true}') });
    const b = res({ responseBody: json('{"id":1,"name":"Cap","tags":["a","c","d"],"fresh":1}') });
    expect(diffResponses(a, b).body).toEqual({
      kind: 'json',
      changes: [
        { path: '$.name', change: 'changed', from: 'Hat', to: 'Cap' },
        { path: '$.tags[1]', change: 'changed', from: 'b', to: 'c' },
        { path: '$.tags[2]', change: 'added', to: 'd' },
        { path: '$.old', change: 'removed', from: true },
        { path: '$.fresh', change: 'added', to: 1 },
      ],
    });
  });

  it('is "same" when the bodies are equal', () => {
    const a = res({ responseBody: json('{"a":1}') });
    expect(diffResponses(a, res({ responseBody: json('{ "a": 1 }') })).body).toEqual({ kind: 'same' });
  });
});

describe('diffResponses: text body', () => {
  it('diffs by line when either body is not JSON', () => {
    const a = res({ responseBody: plain('one\ntwo\nthree') });
    const b = res({ responseBody: plain('one\n2\nthree\nfour') });
    expect(diffResponses(a, b).body).toEqual({
      kind: 'text',
      lines: [
        { op: 'same', text: 'one' },
        { op: 'remove', text: 'two' },
        { op: 'add', text: '2' },
        { op: 'same', text: 'three' },
        { op: 'add', text: 'four' },
      ],
    });
  });

  it('cannot diff binary bodies', () => {
    const bin: Body = { kind: 'binary', mime: null, size: 3 };
    expect(diffResponses(res({ responseBody: bin }), res({ responseBody: plain('x') })).body).toEqual({ kind: 'unavailable' });
  });
});
