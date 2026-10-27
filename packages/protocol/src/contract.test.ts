import { describe, expect, it } from 'vitest';
import { buildContract, endpointOf, inferShape, mergeShapes, shapeKinds, shapeRows, toTypeScript } from './contract';
import { makeRequest } from './testing';

const ep = (url: string, method = 'GET') => endpointOf(makeRequest({ url, method }));

describe('endpointOf', () => {
  it('replaces numeric, UUID and long hex segments with :id', () => {
    expect(ep('http://x/api/products/12')).toBe('GET /api/products/:id');
    expect(ep('http://x/api/users/3f2b8c1e-9a4d-4e7b-8c11-0a1b2c3d4e5f/orders/7')).toBe('GET /api/users/:id/orders/:id');
    expect(ep('http://x/api/blobs/5d41402abc4b2a76b9719d911017c592')).toBe('GET /api/blobs/:id');
  });

  it('keeps ordinary segments, ignores the query and hash, and keys on the method', () => {
    expect(ep('http://x/api/products?page=2#top')).toBe('GET /api/products');
    expect(ep('http://x/api/v2/products/abc', 'post')).toBe('POST /api/v2/products/abc');
    expect(ep('http://x/')).toBe('GET /');
  });

  it('templates the raw path of a URL that does not parse', () => {
    expect(ep('/api/products/5?x=1')).toBe('GET /api/products/:id');
  });
});

describe('inferShape', () => {
  it('reads primitives and null', () => {
    expect(shapeKinds(inferShape('a'))).toEqual(['string']);
    expect(shapeKinds(inferShape(1))).toEqual(['number']);
    expect(shapeKinds(inferShape(true))).toEqual(['boolean']);
    expect(shapeKinds(inferShape(null))).toEqual(['null']);
  });

  it('reads nested objects and records each field as seen once', () => {
    const s = inferShape({ id: 1, tags: ['a'], owner: { name: 'x' } });
    expect(shapeKinds(s)).toEqual(['object']);
    expect(Object.keys(s.object!.fields)).toEqual(['id', 'tags', 'owner']);
    expect(s.object!.count).toBe(1);
    expect(s.object!.fields['id']).toMatchObject({ seen: 1 });
    expect(shapeKinds(s.object!.fields['tags'].shape)).toEqual(['array']);
    expect(shapeKinds(s.object!.fields['tags'].shape.array!)).toEqual(['string']);
    expect(shapeKinds(s.object!.fields['owner'].shape.object!.fields['name'].shape)).toEqual(['string']);
  });

  it('merges the elements of an array of objects, marking fields that vary as partly seen', () => {
    const s = inferShape([{ id: 1, note: 'a' }, { id: 2 }, { id: 3, note: null }]);
    const el = s.array!;
    expect(el.object!.count).toBe(3);
    expect(el.object!.fields['id'].seen).toBe(3);
    expect(el.object!.fields['note'].seen).toBe(2);
    expect(shapeKinds(el.object!.fields['note'].shape)).toEqual(['string', 'null']);
  });

  it('gives an empty array an unknown element type, and a mixed array a union', () => {
    expect(shapeKinds(inferShape([]).array!)).toEqual([]);
    expect(shapeKinds(inferShape([1, 'a', null]).array!)).toEqual(['string', 'number', 'null']);
  });

  it('samples at most the first 100 elements of an array', () => {
    const rows = Array.from({ length: 150 }, (_, i) => (i < 100 ? { a: 1 } : { b: 2 }));
    const el = inferShape(rows).array!;
    expect(el.object!.count).toBe(100);
    expect(Object.keys(el.object!.fields)).toEqual(['a']);
  });
});

describe('mergeShapes', () => {
  it('unions primitive kinds', () => {
    expect(shapeKinds(mergeShapes(inferShape('a'), inferShape(1)))).toEqual(['string', 'number']);
  });

  it('adds up object counts and field sightings', () => {
    const m = mergeShapes(inferShape({ id: 1, a: 'x' }), inferShape({ id: 2, b: true }));
    expect(m.object!.count).toBe(2);
    expect(m.object!.fields['id'].seen).toBe(2);
    expect(m.object!.fields['a'].seen).toBe(1);
    expect(m.object!.fields['b'].seen).toBe(1);
  });

  it('keeps an object and a primitive side by side', () => {
    expect(shapeKinds(mergeShapes(inferShape({ a: 1 }), inferShape(null)))).toEqual(['null', 'object']);
  });

  it('merges array element shapes, and an empty array does not hide a known element type', () => {
    expect(shapeKinds(mergeShapes(inferShape([]), inferShape([1])).array!)).toEqual(['number']);
    expect(shapeKinds(mergeShapes(inferShape([1]), inferShape(['a'])).array!)).toEqual(['string', 'number']);
  });
});

describe('buildContract', () => {
  const res = (id: string, body: unknown, over: Parameters<typeof makeRequest>[0] = {}) =>
    makeRequest({
      id,
      url: 'http://x/api/items/1',
      status: 200,
      responseBody: { kind: 'json', text: JSON.stringify(body), size: 1, truncated: false },
      ...over,
    });
  const E = 'GET /api/items/:id';

  it('merges the 2xx JSON responses of one Endpoint and ignores other Endpoints and errors', () => {
    const c = buildContract(
      [res('a', { id: 1 }), res('b', { id: 2 }, { url: 'http://x/api/items/2' }), res('c', { other: true }, { url: 'http://x/api/other' }), res('d', { error: 'x' }, { status: 404 })],
      E,
    );
    expect(c.endpoint).toBe(E);
    expect(c.used).toEqual(['a', 'b']);
    expect(c.skipped).toEqual([]);
    expect(c.shape!.object!.count).toBe(2);
    expect(Object.keys(c.shape!.object!.fields)).toEqual(['id']);
    expect(c.drift).toEqual([]);
  });

  it('ignores responses answered by a Mock Rule, so a canned body causes no Drift', () => {
    const c = buildContract([res('real', { price: 9 }), res('fake', { price: 'free' }, { mocked: true })], E);
    expect(c.used).toEqual(['real']);
    expect(c.skipped).toEqual([]);
    expect(c.drift).toEqual([]);
    expect(buildContract([res('fake', { a: 1 }, { mocked: true })], E).shape).toBeNull();
  });

  it('has no shape when nothing could be inferred', () => {
    const c = buildContract([res('a', null, { responseBody: { kind: 'none' } })], E);
    expect(c.shape).toBeNull();
    expect(c.skipped).toEqual([{ id: 'a', reason: 'not-json' }]);
  });

  it('lists truncated and non-JSON bodies as skipped, not as drift', () => {
    const cut = res('cut', null, { responseBody: { kind: 'json', text: '{"a":', size: 5, truncated: true } });
    const text = res('txt', null, { responseBody: { kind: 'text', text: 'hi', size: 2, truncated: false } });
    const broken = res('bad', null, { responseBody: { kind: 'json', text: '{"a":', size: 5, truncated: false } });
    const c = buildContract([res('ok', { a: 1 }), cut, text, broken], E);
    expect(c.used).toEqual(['ok']);
    expect(c.skipped).toEqual([
      { id: 'cut', reason: 'truncated' },
      { id: 'txt', reason: 'not-json' },
      { id: 'bad', reason: 'not-json' },
    ]);
    expect(c.drift).toEqual([]);
  });

  it('reports a field whose type changed, with the requests on each side', () => {
    const c = buildContract([res('a', { price: '9' }), res('b', { price: 9 }), res('c', { price: '10' })], E);
    expect(c.drift).toEqual([
      {
        path: '$.price',
        kind: 'type',
        variants: [
          { label: 'string', requestIds: ['a', 'c'] },
          { label: 'number', requestIds: ['b'] },
        ],
      },
    ]);
  });

  it('reports a field present in some responses and missing in others', () => {
    const c = buildContract([res('a', { id: 1, note: 'x' }), res('b', { id: 2 })], E);
    expect(c.drift).toEqual([
      {
        path: '$.note',
        kind: 'optional',
        variants: [
          { label: 'present', requestIds: ['a'] },
          { label: 'missing', requestIds: ['b'] },
        ],
      },
    ]);
  });

  it('reports null mixed with a value', () => {
    const c = buildContract([res('a', { owner: null }), res('b', { owner: 'ada' })], E);
    expect(c.drift).toEqual([
      {
        path: '$.owner',
        kind: 'nullable',
        variants: [
          { label: 'null', requestIds: ['a'] },
          { label: 'value', requestIds: ['b'] },
        ],
      },
    ]);
  });

  it('does not count a field that is always null, or an empty array, as drift', () => {
    expect(buildContract([res('a', { owner: null }), res('b', { owner: null })], E).drift).toEqual([]);
    expect(buildContract([res('a', { items: [] }), res('b', { items: [{ n: 1 }] })], E).drift).toEqual([]);
  });

  it('finds drift inside arrays and nested objects', () => {
    const c = buildContract([res('a', { items: [{ n: 1 }], meta: { page: 1 } }), res('b', { items: [{ n: '1' }], meta: { page: 1 } })], E);
    expect(c.drift.map((d) => [d.path, d.kind])).toEqual([['$.items[].n', 'type']]);
  });

  it('does not report fields as missing when their parent is absent or not an object', () => {
    const c = buildContract([res('a', { meta: { page: 1 } }), res('b', { meta: null }), res('c', {})], E);
    expect(c.drift.map((d) => [d.path, d.kind])).toEqual([['$.meta', 'optional'], ['$.meta', 'nullable']]);
  });
});

describe('toTypeScript', () => {
  const ts = (bodies: unknown[], url = 'http://x/api/products/1') => {
    const reqs = bodies.map((b, i) =>
      makeRequest({ id: `r${i}`, url, status: 200, responseBody: { kind: 'json', text: JSON.stringify(b), size: 1, truncated: false } }),
    );
    return toTypeScript(buildContract(reqs, endpointOf(reqs[0])));
  };

  it('names the root from the last non-placeholder path segment, singularised', () => {
    expect(ts([{ id: 1 }])).toBe('export interface Product {\n  id: number;\n}\n');
    expect(ts([{ id: 1 }], 'http://x/api/categories/1')).toContain('export interface Category {');
    expect(ts([{ id: 1 }], 'http://x/api/addresses/1')).toContain('export interface Address {');
  });

  it('falls back to Response when no name can be derived', () => {
    expect(ts([{ id: 1 }], 'http://x/')).toContain('export interface Response {');
    expect(ts([{ id: 1 }], 'http://x/api/42/7')).toContain('export interface Api {');
    expect(ts([{ id: 1 }], 'http://x/2fa')).toContain('export interface Response2fa {');
  });

  it('writes nested objects as named interfaces after their parent', () => {
    expect(ts([{ id: 1, owner: { name: 'a', address: { city: 'x' } } }])).toBe(
      [
        'export interface Product {',
        '  id: number;',
        '  owner: ProductOwner;',
        '}',
        '',
        'export interface ProductOwner {',
        '  name: string;',
        '  address: ProductOwnerAddress;',
        '}',
        '',
        'export interface ProductOwnerAddress {',
        '  city: string;',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('marks fields optional or nullable from the responses seen', () => {
    const out = ts([{ id: 1, note: 'x', owner: null }, { id: 2, owner: 'ada' }]);
    expect(out).toContain('  id: number;');
    expect(out).toContain('  note?: string;');
    expect(out).toContain('  owner: string | null;');
  });

  it('writes arrays, singularising the element interface, and unions of element types', () => {
    const out = ts([{ tags: ['a'], items: [{ n: 1 }], mixed: [1, 'a'], none: [] }]);
    expect(out).toContain('  tags: string[];');
    expect(out).toContain('  items: ProductItem[];');
    expect(out).toContain('  mixed: (string | number)[];');
    expect(out).toContain('  none: unknown[];');
    expect(out).toContain('export interface ProductItem {\n  n: number;\n}');
  });

  it('merges the object shapes of an array into one interface with optional fields', () => {
    const out = ts([{ items: [{ n: 1, label: 'a' }, { n: 2 }] }]);
    expect(out).toContain('export interface ProductItem {\n  n: number;\n  label?: string;\n}');
  });

  it('types a root array as its element interface plus a list alias', () => {
    const out = ts([[{ id: 1 }, { id: 2 }]], 'http://x/api/products');
    expect(out).toBe('export interface Product {\n  id: number;\n}\n\nexport type ProductList = Product[];\n');
  });

  it('types a primitive root as an alias', () => {
    expect(ts(['hello'], 'http://x/api/greeting')).toBe('export type GreetingResponse = string;\n');
  });

  it('quotes keys that are not identifiers, and keeps names unique', () => {
    const out = ts([{ 'a-b': 1 }]);
    expect(out).toContain('  "a-b": number;');
    const dup = ts([{ owner: { x: { a: 1 } }, ownerX: { b: 1 } }]);
    expect(dup.match(/export interface /g)).toHaveLength(4);
    expect(new Set(dup.match(/export interface \w+/g)).size).toBe(4);
  });

  it('is empty when no shape could be inferred', () => {
    expect(toTypeScript(buildContract([], 'GET /api/products/:id'))).toBe('');
  });
});

describe('shapeRows', () => {
  it('flattens a shape into indented rows with their types and optionality', () => {
    const shape = mergeShapes(inferShape({ id: 1, tags: ['a'], owner: { name: 'x' } }), inferShape({ id: 2, tags: [], owner: null }));
    expect(shapeRows(shape)).toEqual([
      { depth: 0, label: '$', types: 'object', optional: false },
      { depth: 1, label: 'id', types: 'number', optional: false },
      { depth: 1, label: 'tags', types: 'array', optional: false },
      { depth: 2, label: '[]', types: 'string', optional: false },
      { depth: 1, label: 'owner', types: 'null | object', optional: false },
      { depth: 2, label: 'name', types: 'string', optional: false },
    ]);
  });

  it('shows an unknown element type', () => {
    expect(shapeRows(inferShape([])).map((r) => [r.label, r.types])).toEqual([['$', 'array'], ['[]', 'unknown']]);
  });
});
