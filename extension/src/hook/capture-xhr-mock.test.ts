// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { CapturedRequest, MockRule } from '@ngapi/protocol';
import { installCapture, type Recorder } from './capture';

const rule = (overrides: Partial<MockRule> = {}): MockRule => ({
  id: 'm1',
  enabled: true,
  method: '*',
  pattern: '/api/*',
  regex: false,
  component: null,
  delayMs: 0,
  action: { kind: 'passthrough' },
  ...overrides,
});

function setup(mock: MockRule | null, gate: Promise<void> | null = null) {
  const records = new Map<string, Partial<CapturedRequest>>();
  let n = 0;
  const recorder: Recorder = {
    start(_transport, _stack, request, extra) {
      const id = String(++n);
      records.set(id, { ...request, ...extra });
      return id;
    },
    update(id, patch) {
      Object.assign(records.get(id)!, patch);
    },
  };
  const timers: (() => void)[] = [];
  // A fresh subclass so patching its prototype does not leak between tests; send() must never reach the network.
  const XHR = class extends XMLHttpRequest {};
  const nativeSend = vi.fn();
  XHR.prototype.send = nativeSend;
  const target = {
    fetch: vi.fn() as unknown as typeof fetch,
    XMLHttpRequest: XHR as typeof XMLHttpRequest,
    location: { href: 'http://localhost:4200/' },
    setTimeout: ((fn: () => void) => void timers.push(fn)) as unknown as typeof setTimeout,
  };
  installCapture(target, recorder, { gate: () => gate, match: () => mock });
  const xhr = new XHR();
  return { xhr, records, last: () => [...records.values()].at(-1)!, nativeSend, fire: () => timers.splice(0).forEach((t) => t()) };
}

const events = (xhr: XMLHttpRequest, types: string[]) => {
  const seen: string[] = [];
  for (const type of types) xhr.addEventListener(type, () => seen.push(type));
  return seen;
};

describe('xhr mocking', () => {
  it('answers with the canned response through the normal XHR surface, without sending', () => {
    const { xhr, last, nativeSend } = setup(
      rule({ action: { kind: 'respond', status: 201, headers: [['Content-Type', 'application/json'], ['X-Mock', '1']], body: '{"ok":true}' } }),
    );
    const seen = events(xhr, ['readystatechange', 'load', 'loadend']);
    const onload = vi.fn();
    xhr.onload = onload;
    xhr.open('POST', '/api/cart');
    xhr.send('{}');

    expect(nativeSend).not.toHaveBeenCalled();
    expect(xhr.readyState).toBe(4);
    expect(xhr.status).toBe(201);
    expect(xhr.responseText).toBe('{"ok":true}');
    expect(xhr.response).toBe('{"ok":true}');
    expect(xhr.responseURL).toBe('http://localhost:4200/api/cart');
    expect(xhr.getResponseHeader('content-type')).toBe('application/json');
    expect(xhr.getAllResponseHeaders()).toBe('Content-Type: application/json\r\nX-Mock: 1\r\n');
    // open() fires one readystatechange itself; the mock adds HEADERS_RECEIVED, LOADING and DONE.
    expect(seen).toEqual(['readystatechange', 'readystatechange', 'readystatechange', 'readystatechange', 'load', 'loadend']);
    expect(onload).toHaveBeenCalledTimes(1);
    expect(last()).toMatchObject({
      mocked: true,
      status: 201,
      mime: 'application/json',
      responseBody: { kind: 'json', text: '{"ok":true}' },
    });
  });

  it('honours responseType json', () => {
    const { xhr } = setup(rule({ action: { kind: 'respond', status: 200, headers: [], body: '{"a":1}' } }));
    xhr.open('GET', '/api/x');
    xhr.responseType = 'json';
    xhr.send();
    expect(xhr.response).toEqual({ a: 1 });
  });

  it('fails like a network error: status 0 and an error event', () => {
    const { xhr, last, nativeSend } = setup(rule({ action: { kind: 'error' } }));
    const seen = events(xhr, ['error', 'load', 'loadend']);
    xhr.open('GET', '/api/x');
    xhr.send();
    expect(nativeSend).not.toHaveBeenCalled();
    expect(xhr.status).toBe(0);
    expect(xhr.readyState).toBe(4);
    expect(seen).toEqual(['error', 'loadend']);
    expect(last()).toMatchObject({ mocked: true, status: null, error: 'Network error' });
  });

  it('sends the real request only after the delay', () => {
    const { xhr, nativeSend, fire } = setup(rule({ delayMs: 500, action: { kind: 'delay' } }));
    xhr.open('GET', '/api/x');
    xhr.send();
    expect(nativeSend).not.toHaveBeenCalled();
    fire();
    expect(nativeSend).toHaveBeenCalledTimes(1);
  });

  it('an abort during the delay cancels the send and is recorded as Aborted', () => {
    const { xhr, last, nativeSend, fire } = setup(rule({ delayMs: 500, action: { kind: 'delay' } }));
    const seen = events(xhr, ['abort', 'loadend']);
    xhr.open('GET', '/api/x');
    xhr.send();
    xhr.abort();
    fire();
    expect(nativeSend).not.toHaveBeenCalled();
    expect(seen).toEqual(['abort', 'loadend']);
    expect(last()).toMatchObject({ status: null, error: 'Aborted' });
  });

  it('holds sending until the rules have arrived, then applies them', async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const { xhr, nativeSend } = setup(rule({ action: { kind: 'respond', status: 200, headers: [], body: 'mocked' } }), gate);
    xhr.open('GET', '/api/x');
    xhr.send();
    expect(xhr.readyState).toBe(1);
    open();
    await gate;
    await Promise.resolve();
    expect(nativeSend).not.toHaveBeenCalled();
    expect(xhr.responseText).toBe('mocked');
  });

  it('leaves a pass-through request alone', () => {
    const { xhr, last, nativeSend } = setup(rule({ action: { kind: 'passthrough' } }));
    xhr.open('GET', '/api/x');
    xhr.send();
    expect(nativeSend).toHaveBeenCalledTimes(1);
    expect(last().mocked).toBeUndefined();
  });
});
