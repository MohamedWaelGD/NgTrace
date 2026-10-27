import { describe, expect, it } from 'vitest';
import { createMasker, toCurl, toFetch, toCypressStub, toHar, toPlaywrightStub, toPostman } from './export';
import { makeRequest } from './testing';

const mask = createMasker();

const post = makeRequest({
  method: 'POST',
  url: 'http://localhost:4200/api/orders?draft=true',
  requestHeaders: [
    ['Content-Type', 'application/json'],
    ['Authorization', 'Bearer secret-123'],
    ['X-Api-Key', 'k'],
  ],
  requestBody: { kind: 'json', text: '{"qty":2,"note":"it\'s"}', size: 22, truncated: false },
  status: 201,
  statusText: 'Created',
  responseHeaders: [['Set-Cookie', 'sid=1']],
  responseBody: { kind: 'json', text: '{"id":7}', size: 8, truncated: false },
  mime: 'application/json',
  startTime: Date.UTC(2026, 9, 26, 10, 0, 0),
  endTime: Date.UTC(2026, 9, 26, 10, 0, 0) + 120,
  attribution: {
    instanceId: 4,
    className: 'CheckoutComponent',
    confidence: 'context',
    via: 'listener',
    callChain: ['CheckoutComponent', 'OrderService', 'HttpClient'],
    group: null,
    route: null,
    service: 'OrderService',
  },
});

describe('masking', () => {
  it('masks default sensitive headers and token-like names', () => {
    expect(mask.headers(post.requestHeaders)).toEqual([
      ['Content-Type', 'application/json'],
      ['Authorization', '••••••'],
      ['X-Api-Key', '••••••'],
    ]);
  });

  it('accepts a custom list of header names', () => {
    const custom = createMasker(['content-type']);
    expect(custom.headers(post.requestHeaders)[0]).toEqual(['Content-Type', '••••••']);
    expect(custom.isMasked('Authorization')).toBe(false);
  });

  it('always masks token/secret/api-key names, even with a custom list loaded from settings', () => {
    const fromSettings = createMasker(['authorization', 'cookie']);
    expect(fromSettings.isMasked('X-Api-Key')).toBe(true);
    expect(fromSettings.isMasked('X-Refresh-Token')).toBe(true);
  });
});

describe('copy as cURL / fetch', () => {
  it('builds a cURL command with method, masked headers and body', () => {
    expect(toCurl(post, mask)).toBe(
      "curl 'http://localhost:4200/api/orders?draft=true' \\\n" +
        "  -X POST \\\n" +
        "  -H 'Content-Type: application/json' \\\n" +
        "  -H 'Authorization: ••••••' \\\n" +
        "  -H 'X-Api-Key: ••••••' \\\n" +
        "  --data-raw '{\"qty\":2,\"note\":\"it'\\''s\"}'",
    );
  });

  it('can copy unmasked', () => {
    expect(toCurl(post, null)).toContain("-H 'Authorization: Bearer secret-123'");
  });

  it('omits -X for a plain GET', () => {
    expect(toCurl(makeRequest({ url: 'http://x/a' }), mask)).toBe("curl 'http://x/a'");
  });

  it('builds a fetch() call', () => {
    expect(toFetch(post, mask)).toBe(
      'fetch("http://localhost:4200/api/orders?draft=true", {\n' +
        '  "method": "POST",\n' +
        '  "headers": {\n' +
        '    "Content-Type": "application/json",\n' +
        '    "Authorization": "••••••",\n' +
        '    "X-Api-Key": "••••••"\n' +
        '  },\n' +
        '  "body": "{\\"qty\\":2,\\"note\\":\\"it\'s\\"}"\n' +
        '});',
    );
  });
});

describe('HAR export', () => {
  it('exports entries with the _angular field and masked headers', () => {
    const har = toHar([post], mask);
    const entry = har.log.entries[0];
    expect(har.log.version).toBe('1.2');
    expect(entry.startedDateTime).toBe('2026-10-26T10:00:00.000Z');
    expect(entry.time).toBe(120);
    expect(entry.request.queryString).toEqual([{ name: 'draft', value: 'true' }]);
    expect(entry.request.headers).toContainEqual({ name: 'Authorization', value: '••••••' });
    expect(entry.request.postData).toEqual({ mimeType: 'application/json', text: '{"qty":2,"note":"it\'s"}' });
    expect(entry.response.status).toBe(201);
    expect(entry.response.headers).toEqual([{ name: 'Set-Cookie', value: '••••••' }]);
    expect(entry.response.content).toEqual({ size: 8, mimeType: 'application/json', text: '{"id":7}' });
    expect(entry._angular).toEqual({
      component: 'CheckoutComponent',
      instanceId: 4,
      confidence: 'context',
      callChain: ['CheckoutComponent', 'OrderService', 'HttpClient'],
      service: 'OrderService',
      route: null,
    });
  });
});

describe('masking query parameters', () => {
  const withToken = makeRequest({ url: 'http://x/api/items?page=2&access_token=abc.def&api_key=k#top' });

  it('masks only parameters whose names look sensitive', () => {
    expect(mask.url(withToken.url)).toBe('http://x/api/items?page=2&access_token=••••••&api_key=••••••#top');
  });

  it('uses the same custom names as headers', () => {
    expect(createMasker(['page']).url('http://x/a?page=2&q=1')).toBe('http://x/a?page=••••••&q=1');
  });

  it('leaves URLs without a query alone', () => {
    expect(mask.url('http://x/a')).toBe('http://x/a');
    expect(mask.url('http://x/a?flag&q=1')).toBe('http://x/a?flag&q=1');
  });

  it('applies to cURL, fetch and HAR when masked, and not when unmasked', () => {
    expect(toCurl(withToken, mask)).toContain("curl 'http://x/api/items?page=2&access_token=••••••&api_key=••••••#top'");
    expect(toFetch(withToken, mask)).toContain('"http://x/api/items?page=2&access_token=••••••&api_key=••••••#top"');
    const entry = toHar([withToken], mask).log.entries[0];
    expect(entry.request.url).toBe('http://x/api/items?page=2&access_token=••••••&api_key=••••••#top');
    expect(entry.request.queryString).toEqual([
      { name: 'page', value: '2' },
      { name: 'access_token', value: '••••••' },
      { name: 'api_key', value: '••••••' },
    ]);
    expect(toCurl(withToken, null)).toContain('access_token=abc.def');
    expect(toHar([withToken], null).log.entries[0].request.queryString[1]).toEqual({ name: 'access_token', value: 'abc.def' });
  });

  it('keeps the masked URL parseable', () => {
    expect(new URL(mask.url(withToken.url)).searchParams.get('access_token')).toBe('••••••');
  });
});

describe('Postman collection', () => {
  const login = makeRequest({
    method: 'POST',
    url: 'http://localhost:4200/api/login?access_token=abc&next=%2Fhome',
    requestHeaders: [
      ['Content-Type', 'application/json'],
      ['Authorization', 'Bearer secret-123'],
    ],
    requestBody: { kind: 'json', text: '{"user":"ada"}', size: 14, truncated: false },
    startTime: 2_000,
    attribution: { ...post.attribution, className: 'LoginComponent' },
  });
  const list = makeRequest({ url: 'http://localhost:4200/api/products', startTime: 1_000, attribution: { ...post.attribution, className: 'ProductListComponent' } });
  const orphan = makeRequest({ url: 'http://localhost:4200/api/config', startTime: 3_000, attribution: { ...post.attribution, className: null, confidence: 'none' } });
  const second = makeRequest({ url: 'http://localhost:4200/api/products/1', startTime: 4_000, attribution: { ...post.attribution, className: 'ProductListComponent' } });

  it('is a v2.1 collection with one folder per Owner Component in order of first request', () => {
    const c = toPostman([login, list, orphan, second], mask);
    expect(c.info.schema).toBe('https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
    expect(c.item.map((f) => f.name)).toEqual(['ProductListComponent', 'LoginComponent', 'Unattributed']);
    expect(c.item[0].item.map((i) => i.name)).toEqual(['GET /api/products', 'GET /api/products/1']);
  });

  it('maps method, headers, url and a JSON body, masked', () => {
    const item = toPostman([login], mask).item[0].item[0];
    expect(item.request.method).toBe('POST');
    expect(item.request.header).toEqual([
      { key: 'Content-Type', value: 'application/json' },
      { key: 'Authorization', value: '••••••' },
    ]);
    expect(item.request.url).toEqual({
      raw: 'http://localhost:4200/api/login?access_token=••••••&next=%2Fhome',
      protocol: 'http',
      host: ['localhost'],
      port: '4200',
      path: ['api', 'login'],
      query: [
        { key: 'access_token', value: '••••••' },
        { key: 'next', value: '/home' },
      ],
    });
    expect(item.request.body).toEqual({ mode: 'raw', raw: '{"user":"ada"}', options: { raw: { language: 'json' } } });
  });

  it('can export unmasked', () => {
    const item = toPostman([login], null).item[0].item[0];
    expect(item.request.header[1]).toEqual({ key: 'Authorization', value: 'Bearer secret-123' });
    expect(item.request.url.query?.[0]).toEqual({ key: 'access_token', value: 'abc' });
  });

  it('maps form and text bodies and omits empty ones', () => {
    const form = makeRequest({ method: 'POST', requestBody: { kind: 'form', entries: [['a', '1']], size: 3 } });
    const text = makeRequest({ method: 'POST', requestBody: { kind: 'text', text: 'hello', size: 5, truncated: false } });
    const [f, t, n] = toPostman([form, text, makeRequest()], mask).item[0].item;
    expect(f.request.body).toEqual({ mode: 'urlencoded', urlencoded: [{ key: 'a', value: '1' }] });
    expect(t.request.body).toEqual({ mode: 'raw', raw: 'hello' });
    expect(n.request.body).toBeUndefined();
  });
});

describe('test stubs', () => {
  const owner = (className: string | null) => ({ ...post.attribution, className });
  const list = (startTime: number, body: string, className: string | null = 'ProductListComponent') =>
    makeRequest({
      url: 'http://localhost:4200/api/products?page=1',
      startTime,
      status: 200,
      responseHeaders: [
        ['Content-Type', 'application/json'],
        ['Content-Length', '99'],
        ['Set-Cookie', 'sid=1'],
      ],
      responseBody: { kind: 'json', text: body, size: body.length, truncated: false },
      attribution: owner(className),
    });

  it('builds a Playwright route that fulfills the captured response', () => {
    const code = toPlaywrightStub([list(1, '{"items":[1]}')], mask);
    expect(code).toContain("import { test } from '@playwright/test';");
    expect(code).toContain("// ProductListComponent: GET http://localhost:4200/api/products?page=1");
    expect(code).toContain('await page.route("http://localhost:4200/api/products?page=1", async (route) => {');
    expect(code).toContain('if (route.request().method() !== "GET") return route.fallback();');
    expect(code).toContain('status: 200,');
    expect(code).toContain('body: "{\\"items\\":[1]}",');
  });

  it('keeps one route per method and exact URL, with the latest response', () => {
    const code = toPlaywrightStub([list(1, '{"v":1}'), list(2, '{"v":2}')], mask);
    expect(code.match(/page\.route\(/g)).toHaveLength(1);
    expect(code).toContain('{\\"v\\":2}');
    expect(code).not.toContain('{\\"v\\":1}');
  });

  it('drops length and encoding headers, and masks the rest', () => {
    const code = toPlaywrightStub([list(1, '{}')], mask);
    expect(code).toContain('"Content-Type": "application/json"');
    expect(code).not.toMatch(/content-length/i);
    expect(code).toContain('"Set-Cookie": "••••••"');
    expect(toPlaywrightStub([list(1, '{}')], null)).toContain('"Set-Cookie": "sid=1"');
  });

  it('masks query parameters in the route url', () => {
    const r = makeRequest({ url: 'http://x/a?token=abc', responseBody: { kind: 'json', text: '{}', size: 2, truncated: false } });
    expect(toPlaywrightStub([r], mask)).toContain('page.route("http://x/a?token=••••••"');
    expect(toPlaywrightStub([r], null)).toContain('page.route("http://x/a?token=abc"');
  });

  it('notes a truncated body and a missing one', () => {
    const cut = makeRequest({ responseBody: { kind: 'json', text: '{"a":', size: 5, truncated: true } });
    expect(toPlaywrightStub([cut], mask)).toContain('// NOTE: the captured body was truncated at 1 MB');
    const bin = makeRequest({ responseBody: { kind: 'binary', mime: 'image/png', size: 10 } });
    expect(toPlaywrightStub([bin], mask)).toContain('// NOTE: the captured body was binary and is not stubbed');
  });

  it('labels requests with no Owner Component', () => {
    expect(toPlaywrightStub([list(1, '{}', null)], mask)).toContain('// Unattributed: GET');
  });

  it('builds a Cypress intercept with the same response', () => {
    const code = toCypressStub([list(1, '{"items":[1]}')], mask);
    expect(code).toContain("// ProductListComponent: GET http://localhost:4200/api/products?page=1");
    expect(code).toContain('cy.intercept({ method: "GET", url: "http://localhost:4200/api/products?page=1" }, {');
    expect(code).toContain('statusCode: 200,');
    expect(code).toContain('body: "{\\"items\\":[1]}",');
    expect(code).toContain('"Content-Type": "application/json"');
  });

  it('escapes backticks, quotes and newlines through JSON strings', () => {
    const r = makeRequest({ responseBody: { kind: 'text', text: 'a`b"c\nd', size: 7, truncated: false } });
    expect(toPlaywrightStub([r], mask)).toContain('body: "a`b\\"c\\nd",');
  });
});
