import { DEFAULT_MASK_PATTERN, DEFAULT_MASKED_HEADERS, type Body, type CapturedRequest, type Header } from './types';

export const MASK = '••••••';

export interface Masker {
  isMasked(name: string): boolean;
  headers(headers: Header[]): Header[];
}

/** Masks sensitive header values: the given names, plus anything matching the token/secret/api-key pattern. */
export function createMasker(names: string[] = DEFAULT_MASKED_HEADERS, pattern: RegExp = DEFAULT_MASK_PATTERN): Masker {
  const set = new Set(names.map((n) => n.toLowerCase()));
  const isMasked = (name: string) => set.has(name.toLowerCase()) || pattern.test(name);
  return {
    isMasked,
    headers: (headers) => headers.map(([n, v]) => [n, isMasked(n) ? MASK : v]),
  };
}

const visibleHeaders = (h: Header[], mask: Masker | null) => (mask ? mask.headers(h) : h);

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
  const parts = [`curl ${shellQuote(r.url)}`];
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
  return `fetch(${JSON.stringify(r.url)}, ${JSON.stringify(init, null, 2)});`;
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
        url: r.url,
        httpVersion: 'HTTP/1.1',
        headers: nv(visibleHeaders(requestHeaders, mask)),
        queryString: queryOf(r.url),
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
  return { log: { version: '1.2', creator: { name: 'Angular API Inspector', version: '0.1.0' }, entries } };
}
