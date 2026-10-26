import { describe, expect, it } from 'vitest';
import { diffRequests, isEmptyDiff, type RequestSnapshot } from './interceptors';

const snap = (overrides: Partial<RequestSnapshot> = {}): RequestSnapshot => ({
  method: 'GET',
  url: '/api/products',
  params: [],
  headers: [],
  body: null,
  ...overrides,
});

describe('diffRequests', () => {
  it('reports added, removed and changed headers (names compared case-insensitively)', () => {
    const before = snap({ headers: [['X-Client', 'demo'], ['Accept', 'text/plain'], ['X-Old', '1']] });
    const after = snap({ headers: [['x-client', 'demo'], ['Accept', 'application/json'], ['Authorization', 'Bearer t']] });
    const diff = diffRequests(before, after);
    expect(diff.added).toEqual([['Authorization', 'Bearer t']]);
    expect(diff.removed).toEqual([['X-Old', '1']]);
    expect(diff.changed).toEqual([{ name: 'Accept', before: 'text/plain', after: 'application/json' }]);
    expect(diff.fields).toEqual([]);
  });

  it('reports URL, method and params changes', () => {
    const diff = diffRequests(
      snap({ params: [['page', '1']] }),
      snap({ method: 'POST', url: 'https://api.example.com/api/products', params: [['page', '2']] }),
    );
    expect(diff.fields).toEqual([
      { field: 'method', before: 'GET', after: 'POST' },
      { field: 'url', before: '/api/products', after: 'https://api.example.com/api/products' },
      { field: 'params', before: 'page=1', after: 'page=2' },
    ]);
  });

  it('detects a body change by serialised value', () => {
    const diff = diffRequests(snap({ body: '{"a":1}' }), snap({ body: '{"a":2}' }));
    expect(diff.fields).toEqual([{ field: 'body', before: '{"a":1}', after: '{"a":2}' }]);
  });

  it('detects a body replaced by another object with the same serialised value, by reference', () => {
    const diff = diffRequests(snap({ body: '{"a":1}', bodyRef: { a: 1 } }), snap({ body: '{"a":1}', bodyRef: { a: 1 } }));
    expect(diff.fields).toEqual([{ field: 'body', before: '{"a":1}', after: '{"a":1}' }]);
  });

  it('gives an empty diff for a step that passed the request on unchanged', () => {
    const body = { a: 1 };
    const s = snap({ headers: [['X-Client', 'demo']], params: [['q', 'x']], body: '{"a":1}', bodyRef: body });
    const diff = diffRequests(s, { ...s, headers: [['X-Client', 'demo']] });
    expect(isEmptyDiff(diff)).toBe(true);
  });
});
