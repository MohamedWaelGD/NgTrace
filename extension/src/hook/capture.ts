import type { Body, CapturedRequest, Header, ReplaySpec } from '@ngapi/protocol';
import { isTextualMime, mimeOf, readCapped, requestBody, textBody } from './body';

export type RequestPart = Pick<CapturedRequest, 'method' | 'url' | 'requestHeaders' | 'requestBody'>;

/** Receives raw captures; the hook turns them into Captured Requests (with attribution). */
export interface Recorder {
  /** `extra` is merged into the record (a Replayed Request sets `replayOf` and keeps the original's attribution). */
  start(transport: 'fetch' | 'xhr', stack: string, request: RequestPart, extra?: Partial<CapturedRequest>): string;
  update(id: string, patch: Partial<CapturedRequest>): void;
}

export interface CaptureTarget {
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

export function installCapture(target: CaptureTarget, recorder: Recorder): Capture {
  const safe = guarded(recorder);
  const native = target.fetch;
  patchFetch(target, safe);
  patchXhr(target, safe);
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

function patchFetch(target: CaptureTarget, recorder: Recorder): void {
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
    return original.call(this, input, init).then(
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
}

const FAILURES: Record<string, string> = { error: 'Network error', abort: 'Aborted', timeout: 'Timed out' };

function patchXhr(target: CaptureTarget, recorder: Recorder): void {
  const proto = target.XMLHttpRequest.prototype;
  const { open, setRequestHeader, send, addEventListener } = proto;
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
    return send.call(this, body);
  };
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
