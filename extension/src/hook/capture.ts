import type { Body, CapturedRequest, Header, MockRule, ReplaySpec } from '@ngapi/protocol';
import { isTextualMime, mimeOf, readCapped, requestBody, textBody } from './body';

export type RequestPart = Pick<CapturedRequest, 'method' | 'url' | 'requestHeaders' | 'requestBody'>;

/** Receives raw captures; the hook turns them into Captured Requests (with attribution). */
export interface Recorder {
  /** `extra` is merged into the record (a Replayed Request sets `replayOf` and keeps the original's attribution). */
  start(transport: 'fetch' | 'xhr', stack: string, request: RequestPart, extra?: Partial<CapturedRequest>): string;
  update(id: string, patch: Partial<CapturedRequest>): void;
}

/** Decides, per recorded request, whether a Mock Rule applies (ADR 8). */
export interface Mocker {
  /** Non-null while sending must wait for the panel's rules to arrive. */
  gate(): Promise<void> | null;
  /** The rule for a request that was just recorded, or null. */
  match(id: string): MockRule | null;
}

export interface CaptureTarget {
  /** The page's own timer, captured before Zone patches it; used for rule delays. */
  setTimeout?: typeof setTimeout;
  fetch: typeof fetch;
  XMLHttpRequest: typeof XMLHttpRequest;
  location: { href: string };
}

declare global {
  interface ErrorConstructor {
    /** V8-only. */
    stackTraceLimit: number;
  }
}

export function captureStack(): string {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 80;
  const stack = new Error().stack ?? '';
  Error.stackTraceLimit = limit;
  return stack;
}

function absolute(url: string | URL, base: string): string {
  try {
    return new URL(String(url), base).href;
  } catch {
    return String(url);
  }
}

const headerList = (headers: Headers): Header[] => [...headers];
const errorText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

/** Patches `fetch` and `XMLHttpRequest` on the target so every request is reported to the recorder. */
export interface Capture {
  /** Re-sends a request through the native fetch (ADR 7), bypassing Angular, and records it as a Replayed Request. */
  replay(spec: ReplaySpec, extra?: Partial<CapturedRequest>): void;
}

export function installCapture(target: CaptureTarget, recorder: Recorder, mocker?: Mocker): Capture {
  const safe = guarded(recorder);
  const native = target.fetch;
  const timer = target.setTimeout ?? globalThis.setTimeout;
  const later = (fn: () => void, ms: number) => void timer(fn, ms);
  patchFetch(target, safe, mocker, later);
  patchXhr(target, safe, mocker, later);
  return { replay: (spec, extra) => replay(target, native, safe, spec, extra) };
}

function replay(target: CaptureTarget, native: typeof fetch, recorder: Recorder, spec: ReplaySpec, extra?: Partial<CapturedRequest>): void {
  const headers = new Headers();
  for (const [name, value] of spec.headers) headers.append(name, value);
  const init: RequestInit = { method: spec.method, headers };
  if (spec.body !== null) init.body = spec.body;
  const url = absolute(spec.url, target.location.href);
  const id = recorder.start(
    'fetch',
    captureStack(),
    { method: spec.method, url, requestHeaders: spec.headers, requestBody: requestBody(init.body) },
    { ...extra, replayOf: spec.replayOf },
  );
  native.call(target, url, init).then(
    (res) => {
      if (id) attempt(() => recordFetchResponse(id, res, recorder), undefined);
    },
    (err: unknown) => recorder.update(id, { status: null, error: errorText(err), endTime: Date.now() }),
  );
}

/** Recording must never break the app's own request: failures are swallowed, '' means "not recorded". */
function guarded(recorder: Recorder): Recorder {
  return {
    start(transport, stack, request, extra) {
      try {
        return recorder.start(transport, stack, request, extra);
      } catch {
        return '';
      }
    },
    update(id, patch) {
      if (!id) return;
      try {
        recorder.update(id, patch);
      } catch {
        // ignore
      }
    },
  };
}

function attempt<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

type Later = (fn: () => void, ms: number) => void;

const BODYLESS = new Set([204, 205, 304]);

function wait(later: Later, ms: number, signal?: AbortSignal | null): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    later(resolve, ms);
    signal?.addEventListener('abort', () => reject(new DOMException('The user aborted a request.', 'AbortError')), { once: true });
  });
}

/** Applies a Mock Rule to a fetch: canned response, network error, or the real request after a delay. */
function mockFetch(
  rule: MockRule,
  id: string,
  recorder: Recorder,
  later: Later,
  signal: AbortSignal | null | undefined,
  real: () => Promise<Response>,
): Promise<Response> {
  const delayed = wait(later, rule.delayMs, signal);
  const action = rule.action;
  switch (action.kind) {
    case 'respond':
      return delayed.then(() => {
        recorder.update(id, { mocked: true });
        const status = Math.min(599, Math.max(200, action.status));
        return new Response(BODYLESS.has(status) ? null : action.body, { status, headers: action.headers });
      });
    case 'error':
      return delayed.then(() => {
        recorder.update(id, { mocked: true });
        throw new TypeError('Failed to fetch (mocked)');
      });
    default:
      return delayed.then(real);
  }
}

function patchFetch(target: CaptureTarget, recorder: Recorder, mocker: Mocker | undefined, later: Later): void {
  const original = target.fetch;
  target.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    const isRequest = typeof Request !== 'undefined' && input instanceof Request;
    const id = attempt(() => {
      const stack = captureStack();
      const method = (init?.method ?? (isRequest ? input.method : 'GET')).toUpperCase();
      const url = absolute(isRequest ? input.url : (input as string | URL), target.location.href);
      const headers = new Headers(init?.headers ?? (isRequest ? input.headers : undefined));
      return recorder.start('fetch', stack, {
        method,
        url,
        requestHeaders: headerList(headers),
        requestBody: requestBody(init?.body),
      });
    }, '');
    if (id && isRequest && init?.body === undefined && input.body) {
      const mime = mimeOf(input.headers.get('content-type'));
      input
        .clone()
        .text()
        .then((text) => recorder.update(id, { requestBody: formOrText(text, mime) }))
        .catch(() => {});
    }
    const real = () => original.call(this, input, init);
    const dispatch = () => {
      const rule = id && mocker ? attempt(() => mocker.match(id), null) : null;
      return rule ? mockFetch(rule, id, recorder, later, init?.signal ?? (isRequest ? input.signal : null), real) : real();
    };
    const gate = id && mocker ? attempt(() => mocker.gate(), null) : null;
    return (gate ? gate.then(dispatch) : dispatch()).then(
      (res) => {
        if (id) attempt(() => recordFetchResponse(id, res, recorder), undefined);
        return res;
      },
      (err: unknown) => {
        recorder.update(id, { status: null, error: errorText(err), endTime: Date.now() });
        throw err;
      },
    );
  } as typeof fetch;
}

function formOrText(text: string, mime: string | null): Body {
  if (mime === 'application/x-www-form-urlencoded') {
    const params = new URLSearchParams(text);
    return { kind: 'form', entries: [...params], size: text.length };
  }
  return textBody(text, mime);
}

function recordFetchResponse(id: string, res: Response, recorder: Recorder): void {
  const mime = mimeOf(res.headers.get('content-type'));
  const base: Partial<CapturedRequest> = {
    status: res.status,
    statusText: res.statusText,
    error: null,
    mime,
    responseHeaders: headerList(res.headers),
  };
  if (!res.body) {
    recorder.update(id, { ...base, responseBody: { kind: 'none' }, endTime: Date.now() });
    return;
  }
  if (!isTextualMime(mime)) {
    const length = res.headers.get('content-length');
    recorder.update(id, {
      ...base,
      responseBody: { kind: 'binary', mime, size: length === null ? null : Number(length) },
      endTime: Date.now(),
    });
    return;
  }
  recorder.update(id, base);
  readCapped(res.clone().body!)
    .then(({ text, size }) => recorder.update(id, { responseBody: textBody(text, mime, size), endTime: Date.now() }))
    .catch((err: unknown) => recorder.update(id, { error: errorText(err), endTime: Date.now() }));
}

interface XhrState {
  method: string;
  url: string;
  headers: Header[];
  id?: string;
  failure?: string;
  /** send() is being held back (rules loading, or a rule delay): abort() must still be reported. */
  pending?: boolean;
}

const FAILURES: Record<string, string> = { error: 'Network error', abort: 'Aborted', timeout: 'Timed out' };

function patchXhr(target: CaptureTarget, recorder: Recorder, mocker: Mocker | undefined, later: Later): void {
  const proto = target.XMLHttpRequest.prototype;
  const { open, setRequestHeader, send, addEventListener, abort } = proto;
  const states = new WeakMap<XMLHttpRequest, XhrState>();

  proto.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    attempt(() => states.set(this, { method: String(method).toUpperCase(), url: absolute(url, target.location.href), headers: [] }), undefined);
    return (open as (...a: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof proto.open;

  proto.setRequestHeader = function (this: XMLHttpRequest, name: string, value: string) {
    states.get(this)?.headers.push([name, value]);
    return setRequestHeader.call(this, name, value);
  };

  proto.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const state = states.get(this);
    if (state) {
      attempt(() => {
        state.id = recorder.start('xhr', captureStack(), {
          method: state.method,
          url: state.url,
          requestHeaders: state.headers,
          requestBody: requestBody(body),
        });
        if (!state.id) return;
        for (const type of Object.keys(FAILURES)) {
          addEventListener.call(this, type, () => (state.failure = FAILURES[type]));
        }
        addEventListener.call(this, 'loadend', () => attempt(() => recordXhrResponse(this, state, recorder), undefined));
      }, undefined);
    }
    if (!state?.id || !mocker) return send.call(this, body);
    const id = state.id;
    const run = () => {
      if (!state.pending) return;
      state.pending = false;
      const rule = attempt(() => mocker.match(id), null);
      if (!rule) return send.call(this, body);
      const after = (fn: () => void) => {
        state.pending = true;
        later(() => {
          if (!state.pending) return;
          state.pending = false;
          fn();
        }, rule.delayMs);
      };
      const action = rule.action;
      const answer = () => {
        if (action.kind === 'respond') mockXhrResponse(this, state, action, recorder);
        else if (action.kind === 'error') mockXhrError(this, id, recorder);
        else send.call(this, body);
      };
      if (rule.delayMs > 0) after(answer);
      else answer();
    };
    const gate = attempt(() => mocker.gate(), null);
    state.pending = true;
    if (gate) void gate.then(run);
    else run();
  };

  proto.abort = function (this: XMLHttpRequest) {
    const state = states.get(this);
    if (state?.pending) {
      // Held back by a rule (never sent): report the abort the way a real request would.
      state.pending = false;
      dispatch(this, 'abort');
      dispatch(this, 'loadend');
    }
    return abort.call(this);
  };
}

function dispatch(xhr: XMLHttpRequest, type: string): void {
  xhr.dispatchEvent(type === 'readystatechange' ? new Event(type) : new ProgressEvent(type));
}

function define(xhr: XMLHttpRequest, props: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(props)) Object.defineProperty(xhr, key, { value, configurable: true, writable: true });
}

function mockXhrError(xhr: XMLHttpRequest, id: string, recorder: Recorder): void {
  recorder.update(id, { mocked: true });
  define(xhr, { readyState: 4, status: 0, statusText: '' });
  dispatch(xhr, 'readystatechange');
  dispatch(xhr, 'error');
  dispatch(xhr, 'loadend');
}

/** Makes the XHR look like it received `action`'s response, then fires the events a real one would. */
function mockXhrResponse(xhr: XMLHttpRequest, state: XhrState, action: Extract<MockRule['action'], { kind: 'respond' }>, recorder: Recorder): void {
  if (state.id) recorder.update(state.id, { mocked: true });
  const headers = action.headers;
  const lookup = (name: string) => headers.find(([n]) => n.toLowerCase() === name.toLowerCase())?.[1] ?? null;
  const text = action.body;
  const responseType = xhr.responseType;
  let response: unknown = text;
  if (responseType === 'json') {
    try {
      response = JSON.parse(text);
    } catch {
      response = null;
    }
  } else if (responseType === 'blob') response = new Blob([text]);
  else if (responseType === 'arraybuffer') response = new TextEncoder().encode(text).buffer;
  define(xhr, {
    status: action.status,
    statusText: '',
    responseURL: state.url,
    response,
    responseText: responseType === '' || responseType === 'text' ? text : undefined,
    getAllResponseHeaders: () => headers.map(([n, v]) => `${n}: ${v}\r\n`).join(''),
    getResponseHeader: lookup,
  });
  for (const readyState of [2, 3, 4]) {
    define(xhr, { readyState });
    dispatch(xhr, 'readystatechange');
  }
  dispatch(xhr, 'load');
  dispatch(xhr, 'loadend');
}

function recordXhrResponse(xhr: XMLHttpRequest, state: XhrState, recorder: Recorder): void {
  if (!state.id) return;
  if (state.failure || xhr.status === 0) {
    recorder.update(state.id, { status: null, error: state.failure ?? 'Network error', endTime: Date.now() });
    return;
  }
  const mime = mimeOf(xhr.getResponseHeader('content-type'));
  recorder.update(state.id, {
    status: xhr.status,
    statusText: xhr.statusText,
    error: null,
    mime,
    responseHeaders: parseRawHeaders(xhr.getAllResponseHeaders()),
    responseBody: xhrBody(xhr, mime),
    endTime: Date.now(),
  });
}

function xhrBody(xhr: XMLHttpRequest, mime: string | null): Body {
  switch (xhr.responseType) {
    case '':
    case 'text':
      return xhr.responseText ? textBody(xhr.responseText, mime) : { kind: 'none' };
    case 'json':
      return xhr.response === null ? { kind: 'none' } : textBody(JSON.stringify(xhr.response), 'application/json');
    case 'blob':
      return { kind: 'binary', mime, size: (xhr.response as Blob | null)?.size ?? null };
    case 'arraybuffer':
      return { kind: 'binary', mime, size: (xhr.response as ArrayBuffer | null)?.byteLength ?? null };
    default:
      return { kind: 'binary', mime, size: null };
  }
}

function parseRawHeaders(raw: string): Header[] {
  return raw
    .trim()
    .split(/[\r\n]+/)
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf(':');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()] as Header;
    });
}
