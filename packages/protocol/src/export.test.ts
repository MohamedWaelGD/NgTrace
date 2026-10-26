import { describe, expect, it } from 'vitest';
import { createMasker, toCurl, toFetch, toHar } from './export';
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
