import { DEFAULT_MASK_PATTERN, DEFAULT_MASKED_HEADERS, type Body, type CapturedRequest, type Header } from './types';

export const MASK = '••••••';

export interface Masker {
  isMasked(name: string): boolean;
  headers(headers: Header[]): Header[];
  /** Blanks the values of query parameters whose names are masked, so a shared URL carries no secrets. */
  url(url: string): string;
}

/** Masks sensitive header values: the given names, plus anything matching the token/secret/api-key pattern. */
export function createMasker(names: string[] = DEFAULT_MASKED_HEADERS, pattern: RegExp = DEFAULT_MASK_PATTERN): Masker {
  const set = new Set(names.map((n) => n.toLowerCase()));
  const isMasked = (name: string) => set.has(name.toLowerCase()) || pattern.test(name);
  return {
    isMasked,
    headers: (headers) => headers.map(([n, v]) => [n, isMasked(n) ? MASK : v]),
    url: (url) => {
      const q = url.indexOf('?');
      if (q < 0) return url;
      const hash = url.indexOf('#', q);
      const end = hash < 0 ? url.length : hash;
      const query = url
        .slice(q + 1, end)
        .split('&')
        .map((pair) => {
          const eq = pair.indexOf('=');
          return eq > 0 && isMasked(decodeName(pair.slice(0, eq))) ? `${pair.slice(0, eq + 1)}${MASK}` : pair;
        })
        .join('&');
      return `${url.slice(0, q + 1)}${query}${url.slice(end)}`;
    },
  };
}

function decodeName(name: string): string {
  try {
    return decodeURIComponent(name.replace(/\+/g, ' '));
  } catch {
    return name;
  }
}

const visibleHeaders = (h: Header[], mask: Masker | null) => (mask ? mask.headers(h) : h);
const visibleUrl = (url: string, mask: Masker | null) => (mask ? mask.url(url) : url);

export function bodyText(body: Body): string | null {
  switch (body.kind) {
    case 'json':
    case 'text':
      return body.text;
    case 'form':
      return new URLSearchParams(body.entries).toString();
    default:
      return null;
  }
}

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** "Copy as cURL (bash)". Pass `null` as mask to copy unmasked. */
export function toCurl(r: CapturedRequest, mask: Masker | null): string {
  const parts = [`curl ${shellQuote(visibleUrl(r.url, mask))}`];
  const body = bodyText(r.requestBody);
  if (r.method !== 'GET' || body !== null) parts.push(`-X ${r.method}`);
  for (const [n, v] of visibleHeaders(r.requestHeaders, mask)) parts.push(`-H ${shellQuote(`${n}: ${v}`)}`);
  if (body !== null) parts.push(`--data-raw ${shellQuote(body)}`);
  return parts.join(' \\\n  ');
}

/** "Copy as fetch". Pass `null` as mask to copy unmasked. */
export function toFetch(r: CapturedRequest, mask: Masker | null): string {
  const init: Record<string, unknown> = { method: r.method };
  const headers = visibleHeaders(r.requestHeaders, mask);
  if (headers.length) init['headers'] = Object.fromEntries(headers);
  const body = bodyText(r.requestBody);
  if (body !== null) init['body'] = body;
  return `fetch(${JSON.stringify(visibleUrl(r.url, mask))}, ${JSON.stringify(init, null, 2)});`;
}

export interface HarEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: { name: string; value: string }[];
    queryString: { name: string; value: string }[];
    cookies: never[];
    headersSize: number;
    bodySize: number;
    postData?: { mimeType: string; text: string };
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    headers: { name: string; value: string }[];
    cookies: never[];
    content: { size: number; mimeType: string; text?: string };
    redirectURL: string;
    headersSize: number;
    bodySize: number;
    _error?: string;
  };
  cache: Record<string, never>;
  timings: { send: number; wait: number; receive: number };
  _angular: {
    component: string | null;
    instanceId: number | null;
    confidence: string;
    callChain: string[];
    service: string | null;
    route: string | null;
  };
}

export interface Har {
  log: { version: '1.2'; creator: { name: string; version: string }; entries: HarEntry[] };
}

const nv = (h: Header[]) => h.map(([name, value]) => ({ name, value }));

function queryOf(url: string): { name: string; value: string }[] {
  try {
    return [...new URL(url).searchParams].map(([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
}

const headerValue = (h: Header[], name: string) => h.find(([n]) => n.toLowerCase() === name)?.[1];

export function toHar(requests: CapturedRequest[], mask: Masker | null): Har {
  const entries = requests.map((r): HarEntry => {
    const time = r.endTime === null ? 0 : r.endTime - r.startTime;
    const postText = bodyText(r.requestBody);
    const resText = bodyText(r.responseBody);
    const requestHeaders = r.enrichment?.requestHeaders.length ? r.enrichment.requestHeaders : r.requestHeaders;
    const entry: HarEntry = {
      startedDateTime: new Date(r.startTime).toISOString(),
      time,
      request: {
        method: r.method,
        url: visibleUrl(r.url, mask),
        httpVersion: 'HTTP/1.1',
        headers: nv(visibleHeaders(requestHeaders, mask)),
        queryString: queryOf(visibleUrl(r.url, mask)),
        cookies: [],
        headersSize: -1,
        bodySize: r.requestBody.kind === 'none' ? 0 : (r.requestBody.size ?? -1),
      },
      response: {
        status: r.status ?? 0,
        statusText: r.statusText,
        httpVersion: 'HTTP/1.1',
        headers: nv(visibleHeaders(r.responseHeaders, mask)),
        cookies: [],
        content: { size: r.responseBody.kind === 'none' ? 0 : (r.responseBody.size ?? -1), mimeType: r.mime ?? '' },
        redirectURL: '',
        headersSize: -1,
        bodySize: -1,
      },
      cache: {},
      timings: { send: 0, wait: time, receive: 0 },
      _angular: {
        component: r.attribution.className,
        instanceId: r.attribution.instanceId,
        confidence: r.attribution.confidence,
        callChain: r.attribution.callChain,
        service: r.attribution.service,
        route: r.attribution.route,
      },
    };
    if (postText !== null) {
      entry.request.postData = {
        mimeType: headerValue(r.requestHeaders, 'content-type') ?? (r.requestBody.kind === 'json' ? 'application/json' : ''),
        text: postText,
      };
    }
    if (resText !== null) entry.response.content.text = resText;
    if (r.error) entry.response._error = r.error;
    return entry;
  });
  return { log: { version: '1.2', creator: { name: 'Ngtrace', version: '0.1.0' }, entries } };
}

export interface PostmanItem {
  name: string;
  request: {
    method: string;
    header: { key: string; value: string }[];
    url: { raw: string; protocol?: string; host?: string[]; port?: string; path?: string[]; query?: { key: string; value: string }[] };
    body?:
      | { mode: 'raw'; raw: string; options?: { raw: { language: 'json' } } }
      | { mode: 'urlencoded'; urlencoded: { key: string; value: string }[] };
  };
  response: never[];
}

export interface PostmanCollection {
  info: { name: string; schema: string };
  item: { name: string; item: PostmanItem[] }[];
}

/** Request headers and body as a Postman `body`; binary and empty bodies are left out. */
function postmanBody(body: Body): PostmanItem['request']['body'] {
  switch (body.kind) {
    case 'json':
      return { mode: 'raw', raw: body.text, options: { raw: { language: 'json' } } };
    case 'text':
      return { mode: 'raw', raw: body.text };
    case 'form':
      return { mode: 'urlencoded', urlencoded: body.entries.map(([key, value]) => ({ key, value })) };
    default:
      return undefined;
  }
}

function postmanUrl(raw: string): PostmanItem['request']['url'] {
  try {
    const u = new URL(raw);
    return {
      raw,
      protocol: u.protocol.replace(':', ''),
      host: u.hostname.split('.'),
      ...(u.port ? { port: u.port } : {}),
      path: u.pathname.split('/').filter(Boolean),
      query: [...u.searchParams].map(([key, value]) => ({ key, value })),
    };
  } catch {
    return { raw };
  }
}

/** Postman v2.1 collection: one folder per Owner Component ("Unattributed" for none), requests in time order. */
export function toPostman(requests: CapturedRequest[], mask: Masker | null): PostmanCollection {
  const folders = new Map<string, PostmanItem[]>();
  for (const r of [...requests].sort((a, b) => a.startTime - b.startTime)) {
    const url = visibleUrl(r.url, mask);
    let path = url;
    try {
      path = new URL(url).pathname;
    } catch {
      // keep the raw URL as the item name
    }
    const body = postmanBody(r.requestBody);
    const item: PostmanItem = {
      name: `${r.method} ${path}`,
      request: { method: r.method, header: visibleHeaders(r.requestHeaders, mask).map(([key, value]) => ({ key, value })), url: postmanUrl(url), ...(body ? { body } : {}) },
      response: [],
    };
    const folder = r.attribution.className ?? 'Unattributed';
    folders.set(folder, [...(folders.get(folder) ?? []), item]);
  }
  return {
    info: { name: 'Ngtrace capture', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item: [...folders].map(([name, item]) => ({ name, item })),
  };
}

interface Stub {
  owner: string;
  method: string;
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string | null;
  note: string | null;
}

/** Headers describing the wire encoding of the original body, which no longer applies to a stubbed one. */
const WIRE_HEADERS = new Set(['content-length', 'content-encoding', 'transfer-encoding', 'connection']);

/** One stub per method + exact URL, from the latest response; requests that got no response are skipped. */
function stubsOf(requests: CapturedRequest[], mask: Masker | null): Stub[] {
  const latest = new Map<string, CapturedRequest>();
  for (const r of [...requests].sort((a, b) => a.startTime - b.startTime)) {
    if (!r.status) continue;
    const key = `${r.method} ${r.url}`;
    latest.delete(key);
    latest.set(key, r);
  }
  return [...latest.values()].map((r) => {
    const headers: Record<string, string> = {};
    for (const [n, v] of visibleHeaders(r.responseHeaders, mask)) {
      if (!WIRE_HEADERS.has(n.toLowerCase())) headers[n] = n in headers ? `${headers[n]}, ${v}` : v;
    }
    const body = r.responseBody;
    return {
      owner: r.attribution.className ?? 'Unattributed',
      method: r.method,
      url: visibleUrl(r.url, mask),
      status: r.status!,
      headers,
      body: bodyText(body),
      note:
        body.kind === 'binary'
          ? 'the captured body was binary and is not stubbed'
          : (body.kind === 'json' || body.kind === 'text') && body.truncated
            ? 'the captured body was truncated at 1 MB'
            : null,
    };
  });
}

const indent = (json: string, pad: string) => json.replace(/\n/g, `\n${pad}`);

/** Playwright test that replays the captured responses with `page.route`. */
export function toPlaywrightStub(requests: CapturedRequest[], mask: Masker | null): string {
  const routes = stubsOf(requests, mask).map((s) =>
    [
      `  // ${s.owner}: ${s.method} ${s.url}`,
      ...(s.note ? [`  // NOTE: ${s.note}`] : []),
      `  await page.route(${JSON.stringify(s.url)}, async (route) => {`,
      `    if (route.request().method() !== ${JSON.stringify(s.method)}) return route.fallback();`,
      `    await route.fulfill({`,
      `      status: ${s.status},`,
      `      headers: ${indent(JSON.stringify(s.headers, null, 2), '      ')},`,
      ...(s.body !== null ? [`      body: ${JSON.stringify(s.body)},`] : []),
      `    });`,
      `  });`,
    ].join('\n'),
  );
  return [`import { test } from '@playwright/test';`, '', `test('stubbed API', async ({ page }) => {`, routes.join('\n\n'), '', `  // await page.goto('/');`, `});`, ''].join('\n');
}

/** Cypress spec that replays the captured responses with `cy.intercept`. */
export function toCypressStub(requests: CapturedRequest[], mask: Masker | null): string {
  const routes = stubsOf(requests, mask).map((s) =>
    [
      `    // ${s.owner}: ${s.method} ${s.url}`,
      ...(s.note ? [`    // NOTE: ${s.note}`] : []),
      `    cy.intercept({ method: ${JSON.stringify(s.method)}, url: ${JSON.stringify(s.url)} }, {`,
      `      statusCode: ${s.status},`,
      `      headers: ${indent(JSON.stringify(s.headers, null, 2), '      ')},`,
      ...(s.body !== null ? [`      body: ${JSON.stringify(s.body)},`] : []),
      `    });`,
    ].join('\n'),
  );
  return [`describe('stubbed API', () => {`, `  beforeEach(() => {`, routes.join('\n\n'), `  });`, '', `  it('uses the stubs', () => {`, `    // cy.visit('/');`, `  });`, `});`, ''].join('\n');
}
