import { describe, expect, it, vi } from 'vitest';
import type { CapturedRequest } from '@ngapi/protocol';
import { installCapture, type Recorder } from './capture';

type Rec = { transport: string; stack: string; data: Partial<CapturedRequest> };

function recorder() {
  const records = new Map<string, Rec>();
  let n = 0;
  const rec: Recorder = {
    start(transport, stack, request) {
      const id = String(++n);
      records.set(id, { transport, stack, data: { ...request } });
      return id;
    },
    update(id, patch) {
      Object.assign(records.get(id)!.data, patch);
    },
  };
  return { rec, records, last: () => [...records.values()].at(-1)! };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function fetchTarget(impl: typeof fetch) {
  // A fresh subclass per test, so patches on its prototype don't leak between tests.
  const XHR = class extends FakeXHR {};
  return { fetch: impl, XMLHttpRequest: XHR as unknown as typeof XMLHttpRequest, location: { href: 'http://localhost:4200/products/1' } };
}

describe('fetch capture', () => {
  it('records the request with absolute URL and the response, leaving the response readable', async () => {
    const { rec, last } = recorder();
    const target = fetchTarget(async () =>
      new Response('{"items":[1]}', { status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' } }),
    );
    installCapture(target, rec);

    const res = await target.fetch('/api/items?page=2');
    expect(await res.json()).toEqual({ items: [1] });
    await flush();

    const r = last();
    expect(r.transport).toBe('fetch');
    expect(r.stack).toContain('Error');
    expect(r.data).toMatchObject({
      method: 'GET',
      url: 'http://localhost:4200/api/items?page=2',
      status: 200,
      mime: 'application/json',
      responseHeaders: [['content-type', 'application/json']],
      responseBody: { kind: 'json', text: '{"items":[1]}', size: 13, truncated: false },
    });
    expect(r.data.endTime).toBeTypeOf('number');
  });

  it('records method, headers and JSON body from init', async () => {
    const { rec, last } = recorder();
    const target = fetchTarget(async () => new Response(null, { status: 204 }));
    installCapture(target, rec);

    await target.fetch('http://api.test/orders', {
      method: 'post',
      headers: { 'Content-Type': 'application/json', 'X-Trace': '1' },
      body: JSON.stringify({ qty: 2 }),
    });
    await flush();

    expect(last().data).toMatchObject({
      method: 'POST',
      requestHeaders: [['content-type', 'application/json'], ['x-trace', '1']],
      requestBody: { kind: 'json', text: '{"qty":2}', size: 9, truncated: false },
      status: 204,
      responseBody: { kind: 'none' },
    });
  });

  it('reads the body of a Request object', async () => {
    const { rec, last } = recorder();
    const target = fetchTarget(async () => new Response('ok', { headers: { 'content-type': 'text/plain' } }));
    installCapture(target, rec);

    await target.fetch(new Request('http://api.test/form', { method: 'PUT', body: new URLSearchParams({ a: '1', b: '2' }) }));
    await flush();

    expect(last().data).toMatchObject({
      method: 'PUT',
      requestBody: { kind: 'form', entries: [['a', '1'], ['b', '2']], size: 7 },
      responseBody: { kind: 'text', text: 'ok' },
    });
  });

  it('records network errors and still rejects', async () => {
    const { rec, last } = recorder();
    const target = fetchTarget(async () => {
      throw new TypeError('Failed to fetch');
    });
    installCapture(target, rec);

    await expect(target.fetch('/api/down')).rejects.toThrow('Failed to fetch');
    expect(last().data).toMatchObject({ status: null, error: 'TypeError: Failed to fetch' });
  });

  it('never stores binary responses, only type and size', async () => {
    const { rec, last } = recorder();
    const target = fetchTarget(async () =>
      new Response(new Uint8Array(10), { headers: { 'content-type': 'image/png', 'content-length': '10' } }),
    );
    installCapture(target, rec);

    await target.fetch('/logo.png');
    await flush();

    expect(last().data.responseBody).toEqual({ kind: 'binary', mime: 'image/png', size: 10 });
  });

  it('truncates text bodies over 1 MB', async () => {
    const { rec, last } = recorder();
    const big = 'x'.repeat(1024 * 1024 + 10);
    const target = fetchTarget(async () => new Response(big, { headers: { 'content-type': 'text/plain' } }));
    installCapture(target, rec);

    await target.fetch('/big');
    await flush();
    await flush();

    const body = last().data.responseBody as { text: string; truncated: boolean; size: number };
    expect(body.truncated).toBe(true);
    expect(body.text.length).toBe(1024 * 1024);
  });
});

describe('capture never breaks the app', () => {
  const broken: Recorder = {
    start() {
      throw new Error('recorder bug');
    },
    update() {
      throw new Error('recorder bug');
    },
  };

  it('fetch still resolves when recording throws', async () => {
    const target = fetchTarget(async () => new Response('ok', { headers: { 'content-type': 'text/plain' } }));
    installCapture(target, broken);
    const res = await target.fetch('/api/x');
    expect(await res.text()).toBe('ok');
  });

  it('XHR still sends when recording throws', () => {
    const send = vi.spyOn(FakeXHR.prototype, 'send');
    const target = fetchTarget(vi.fn());
    installCapture(target, broken);
    const xhr = new target.XMLHttpRequest() as unknown as FakeXHR;
    xhr.open('GET', '/api/x');
    expect(() => xhr.send()).not.toThrow();
    expect(send).toHaveBeenCalled();
    expect(() => xhr.respond(200, 'OK', '', 'x')).not.toThrow();
  });
});

describe('XHR capture', () => {
  it('records open/setRequestHeader/send and the response on loadend', () => {
    const { rec, last } = recorder();
    const target = fetchTarget(vi.fn());
    installCapture(target, rec);

    const xhr = new target.XMLHttpRequest() as unknown as FakeXHR;
    xhr.open('POST', '/api/search?q=shoes');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send('{"term":"shoes"}');

    expect(last()).toMatchObject({
      transport: 'xhr',
      data: {
        method: 'POST',
        url: 'http://localhost:4200/api/search?q=shoes',
        requestHeaders: [['Content-Type', 'application/json']],
        requestBody: { kind: 'json', text: '{"term":"shoes"}', size: 16, truncated: false },
      },
    });

    xhr.respond(201, 'Created', 'content-type: application/json\r\nx-id: 9\r\n', '{"ok":true}');

    expect(last().data).toMatchObject({
      status: 201,
      statusText: 'Created',
      mime: 'application/json',
      responseHeaders: [['content-type', 'application/json'], ['x-id', '9']],
      responseBody: { kind: 'json', text: '{"ok":true}' },
      error: null,
    });
  });

  it('records a failed XHR as an error', () => {
    const { rec, last } = recorder();
    const target = fetchTarget(vi.fn());
    installCapture(target, rec);

    const xhr = new target.XMLHttpRequest() as unknown as FakeXHR;
    xhr.open('GET', 'http://other.test/x');
    xhr.send();
    xhr.fail('error');

    expect(last().data).toMatchObject({ status: null, error: 'Network error' });
  });
});

/** Minimal XMLHttpRequest stand-in: enough surface for the capture hook. */
class FakeXHR {
  status = 0;
  statusText = '';
  responseType = '';
  response: unknown = '';
  responseText = '';
  private headers = '';
  private listeners: Record<string, ((e: unknown) => void)[]> = {};
  open(_method: string, _url: string) {}
  setRequestHeader(_n: string, _v: string) {}
  send(_body?: unknown) {}
  getAllResponseHeaders() {
    return this.headers;
  }
  getResponseHeader(name: string) {
    const line = this.headers.split('\r\n').find((l) => l.toLowerCase().startsWith(name.toLowerCase() + ':'));
    return line ? line.slice(line.indexOf(':') + 1).trim() : null;
  }
  addEventListener(type: string, fn: (e: unknown) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  private emit(type: string) {
    for (const fn of this.listeners[type] ?? []) fn({ type });
  }
  respond(status: number, statusText: string, headers: string, body: string) {
    Object.assign(this, { status, statusText, headers, response: body, responseText: body });
    this.emit('load');
    this.emit('loadend');
  }
  fail(type: 'error' | 'abort' | 'timeout') {
    this.emit(type);
    this.emit('loadend');
  }
}
