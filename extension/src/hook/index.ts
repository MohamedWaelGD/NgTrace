/**
 * Main-world hook, injected at document_start (ADR 3). Captures requests into a page-side ring
 * buffer, attributes them to components, scans the component tree and answers panel commands.
 */
import {
  CONTENT_SOURCE,
  HOOK_SOURCE,
  RING_BUFFER_SIZE,
  type AngularStatus,
  type CapturedRequest,
  type HookMessage,
  type PanelCommand,
  type TreeNode,
  type WindowEnvelope,
} from '@ngtrace/protocol';
import { AngularInternals } from './angular-internals';
import { attribute, type AttributionInput } from './attribution';
import { captureStack, installCapture, type Recorder } from './capture';
import { textBody } from './body';
import { InterceptorTracker } from './interceptors';
import { OwnerContext } from './context';
import { Inspector } from './inspect';
import { LiveValues } from './live';
import { MockEngine } from './mock-engine';
import { NavLog, navigationEventOf } from './nav-log';
import { Overlay } from './overlay';
import { InstanceRegistry } from './registry';
import { ResourceTracker } from './resources';
import { revealElement } from './reveal';
import { detectAngular, previewOptions, TreeScanner, type NgGlobals } from './tree';

/* eslint-disable @typescript-eslint/no-explicit-any */
const win = window as any;

if (!win.__ngtraceHookInstalled) {
  win.__ngtraceHookInstalled = true;
  start();
}

function start(): void {
  const setTimeoutNative = window.setTimeout.bind(window);
  const pageId = Math.random().toString(36).slice(2, 10);
  const registry = new InstanceRegistry();
  const context = new OwnerContext(registry);
  const scanner = new TreeScanner(registry);
  const overlay = new Overlay(document);
  const internals = new AngularInternals();
  const inspector = new Inspector(registry, scanner, () => win.ng ?? {});

  const live = new LiveValues(
    {
      inputs: (id) => scanner.inputs(id, ng()),
      entries: (target, path) => inspector.expand(target, path),
      isGone: (target) => (target.kind === 'component' ? registry.isDestroyed(target.id) : !inspector.hasService(target.id)),
      signals: (id) => inspector.signals(id),
    },
    (update) => post({ type: 'live', pageId, update: { ...update, at: monoNow() } }),
    (fn, ms) => setTimeoutNative(fn, ms),
  );
  context.onChangeDetection = () => live.changeDetected();

  const navLog = new NavLog();
  const monoNow = () => performance.timeOrigin + performance.now();
  internals.onRouterEvent = (e) => {
    const event = navigationEventOf(e, monoNow());
    if (!event) return;
    navLog.add(event);
    post({ type: 'navigation', pageId, event });
  };

  const MOCK_HINT_KEY = '__ngtrace_mocks';
  const mocks = new MockEngine({
    now: () => Date.now(),
    schedule: (fn, ms) => void setTimeoutNative(fn, ms),
    // Synchronous memory for the next page load: "rules were armed here", so early requests wait for them.
    hint: {
      get: () => {
        try {
          return sessionStorage.getItem(MOCK_HINT_KEY) === '1';
        } catch {
          return false;
        }
      },
      set: (on) => {
        try {
          if (on) sessionStorage.setItem(MOCK_HINT_KEY, '1');
          else sessionStorage.removeItem(MOCK_HINT_KEY);
        } catch {
          // Storage can be unavailable (sandboxed frames): early requests then simply are not held.
        }
      },
    },
    onGateTimeout: () =>
      post({ type: 'mock-warning', pageId, message: 'Some requests were sent before the Mock Rules arrived and were not mocked.' }),
  });

  const order: string[] = [];
  const requests = new Map<string, CapturedRequest>();
  /** Attribution inputs kept so unresolved requests can be re-attributed after later scans. */
  const pending = new Map<string, Omit<AttributionInput, 'registry'>>();
  let seq = 0;
  let paused = false;
  let status: AngularStatus = { kind: 'pending' };
  let tree: TreeNode[] = [];

  const post = (payload: HookMessage) => {
    const envelope: WindowEnvelope<HookMessage> = { source: HOOK_SOURCE, payload };
    window.postMessage(envelope, '*');
  };
  const ng = (): NgGlobals => win.ng ?? {};
  previewOptions.isSignal = (v) => {
    try {
      return !!win.ng?.isSignal?.(v);
    } catch {
      return false;
    }
  };

  // Find the Router and HttpClient as soon as the first component exists (before the initial navigation).
  context.onComponent = (instance) => {
    internals.tryAttach(win.ng, instance);
    if (internals.done) context.onComponent = null;
  };
  // Owner Resources (ADR 9): wrap resource loaders before the component's first effect flush.
  const resources = new ResourceTracker(context, registry);
  context.onTemplateCreate = (instance) => resources.scan(instance);
  context.watchAngular(win);
  context.patchAsync(win);

  /** Requests sent while Recording is paused: tracked for Mock Rules, but not in the buffer. */
  const unlistedIds = new Set<string>();
  const list = (record: CapturedRequest) => {
    order.push(record.id);
    while (order.length > RING_BUFFER_SIZE) {
      const evicted = order.shift()!;
      requests.delete(evicted);
      pending.delete(evicted);
    }
    post({ type: 'request', pageId, request: record });
  };

  const recorder: Recorder = {
    start(transport, stack, request, extra) {
      // While paused a request is only tracked, unlisted, so Mock Rules can still apply to it (ADR 8);
      // it joins the buffer if a rule answers it. A replay is an explicit action and is always listed.
      const unlisted = paused && !extra?.replayOf;
      const id = `${pageId}:${++seq}`;
      const input = {
        stack,
        // A cold HttpClient observable: where it was created (service, component), not only where it was subscribed.
        creationStack: internals.creationStack,
        syncOwner: context.sync(),
        asyncOwner: context.asyncOwner,
        route: internals.routePhase,
        transport,
      };
      const { attribution, httpClient } = attribute({ ...input, registry });
      // Attempt Number / Retry of the HttpClient observable being subscribed (a replay is never a Retry).
      const attempt = extra?.replayOf ? null : internals.claimAttempt(id);
      const record: CapturedRequest = {
        id,
        transport,
        httpClient,
        ...request,
        status: null,
        statusText: '',
        error: null,
        responseHeaders: [],
        responseBody: { kind: 'none' },
        mime: null,
        startTime: Date.now(),
        startMono: monoNow(),
        endTime: null,
        attribution,
        enrichment: null,
        ...attempt,
        ...extra,
      };
      requests.set(id, record);
      if (unlisted) {
        unlistedIds.add(id);
        return id;
      }
      if (!extra?.attribution && needsRetry(record)) pending.set(id, input);
      list(record);
      // An interceptor's Retry bumped the retry count of the steps the first attempt shares.
      const first = record.retryOf && record.interceptorSteps ? requests.get(record.retryOf) : undefined;
      if (first && !unlistedIds.has(first.id)) post({ type: 'request', pageId, request: first });
      return id;
    },
    update(id, patch) {
      const record = requests.get(id);
      if (!record) return;
      Object.assign(record, patch);
      if (unlistedIds.has(id)) {
        if (record.mocked) {
          unlistedIds.delete(id);
          list(record);
        } else if (patch.endTime !== undefined) {
          unlistedIds.delete(id);
          requests.delete(id);
        }
        return;
      }
      post({ type: 'request', pageId, request: record });
    },
  };
  const capture = installCapture(win, recorder, {
    gate: () => mocks.gate(),
    match: (id) => {
      const record = requests.get(id);
      return record ? mocks.match({ method: record.method, url: record.url, className: record.attribution.className }) : null;
    },
  });

  // Interceptor Steps (ADR 10): on from page load in dev builds. A chain an interceptor answered
  // itself never reaches fetch/XHR, so it is recorded here, with the response the interceptor gave.
  const interceptors = new InterceptorTracker(internals, (request, steps, response) => {
    const query = request.params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    let url = request.url + (query ? (request.url.includes('?') ? '&' : '?') + query : '');
    try {
      url = new URL(url, location.href).href;
    } catch {
      // keep it relative
    }
    const id = recorder.start(
      'xhr',
      captureStack(),
      {
        method: request.method,
        url,
        requestHeaders: request.headers,
        requestBody: request.body === null ? { kind: 'none' } : textBody(request.body, null),
      },
      { shortCircuitedBy: steps.find((s) => s.shortCircuit)?.name ?? 'interceptor' },
    );
    const Observable = response?.constructor;
    if (typeof Observable !== 'function' || typeof response.subscribe !== 'function') return response;
    const finish = (patch: Partial<CapturedRequest>) => recorder.update(id, { endTime: Date.now(), ...patch });
    return new Observable((subscriber: any) =>
      response.subscribe({
        next: (event: any) => {
          // An HttpResponse (not a progress event): status, headers and body.
          if (event && typeof event.status === 'number' && 'body' in event) {
            const headers: [string, string][] = event.headers?.keys?.().flatMap((k: string) => (event.headers.getAll(k) ?? []).map((v: string) => [k, v])) ?? [];
            const json = typeof event.body !== 'string';
            const mime = json ? 'application/json' : null;
            const text = json ? JSON.stringify(event.body ?? null) : event.body;
            finish({ status: event.status, statusText: event.statusText ?? '', responseHeaders: headers, responseBody: textBody(text, mime), mime });
          }
          subscriber.next(event);
        },
        error: (err: any) => {
          finish(typeof err?.status === 'number' && err.status > 0 ? { status: err.status, statusText: err.statusText ?? '' } : { error: String(err?.message ?? err) });
          subscriber.error(err);
        },
        complete: () => subscriber.complete(),
      }),
    );
  });
  internals.onHandler = (handler) => interceptors.wrapHandler(handler);

  const reattribute = () => {
    for (const [id, input] of pending) {
      const record = requests.get(id);
      if (!record) continue;
      const { attribution } = attribute({ ...input, registry });
      if (JSON.stringify(attribution) === JSON.stringify(record.attribution)) continue;
      record.attribution = attribution;
      if (!needsRetry(record)) pending.delete(id);
      post({ type: 'request', pageId, request: record });
    }
  };

  const scan = () => {
    if (status.kind !== 'dev') return;
    const next = scanner.scan(document, ng());
    // Fallback when the profiler is unavailable: attach once the tree has a component.
    const first = next[0] && registry.instance(next[0].id);
    if (!internals.done && first) internals.tryAttach(win.ng, first);
    if (JSON.stringify(next) !== JSON.stringify(tree)) {
      tree = next.map((n) => ({ ...n }));
      post({ type: 'tree', pageId, tree });
    }
    reattribute();
  };

  let scanQueued = false;
  const queueScan = () => {
    if (scanQueued) return;
    scanQueued = true;
    setTimeoutNative(() => {
      scanQueued = false;
      scan();
    }, 150);
  };

  const label = (id: number) => tree.find((n) => n.id === id)?.name ?? '';
  const handle = (command: PanelCommand) => {
    switch (command.type) {
      case 'get-snapshot':
        scan();
        post({
          type: 'snapshot',
          pageId,
          url: location.href,
          status,
          tree,
          requests: order.map((id) => requests.get(id)!),
          navigation: navLog.all(),
        });
        break;
      case 'highlight':
        if (command.id === null) overlay.hide();
        else overlay.show(scanner.element(command.id), label(command.id));
        break;
      case 'pick':
        if (!command.on) overlay.cancelPick();
        else
          overlay.pick(
            (el) => scanner.ownerOf(el),
            label,
            (id) => scanner.element(id),
            (id, el) => post({ type: 'picked', pageId, id, element: describe(el) }),
          );
        break;
      case 'get-details':
        post({ type: 'details', pageId, details: inspector.details(command.id) });
        break;
      case 'reveal':
        post({ type: 'revealed', pageId, id: command.id, ok: revealElement(win, scanner, registry, command.id) });
        break;
      case 'expand':
        post({ type: 'expanded', pageId, target: command.target, path: command.path, entries: inspector.expand(command.target, command.path) });
        break;
      case 'clear':
        order.length = 0;
        requests.clear();
        pending.clear();
        navLog.clear();
        scanner.dropGhosts();
        tree = [];
        scan();
        break;
      case 'replay': {
        // The replay keeps the original's attribution: it groups under the same component, but is not a new call by it.
        const original = requests.get(command.spec.replayOf);
        capture.replay(command.spec, original ? { attribution: structuredClone(original.attribution) } : undefined);
        break;
      }
      case 'mock-rules':
        mocks.arm(command.rules);
        break;
      case 'mock-disarm':
        mocks.disarm();
        break;
      case 'pause':
        paused = command.paused;
        live.paused = paused;
        break;
      case 'live-target':
        live.follow(command.target, command.paths);
        break;
    }
  };

  window.addEventListener('message', (event) => {
    const data = event.data as WindowEnvelope<PanelCommand> | undefined;
    if (event.source === window && data?.source === CONTENT_SOURCE) handle(data.payload);
  });

  const setStatus = (next: AngularStatus) => {
    if (JSON.stringify(next) === JSON.stringify(status)) return;
    status = next;
    post({ type: 'status', pageId, status });
    if (status.kind === 'dev') {
      new MutationObserver(queueScan).observe(document.documentElement, { childList: true, subtree: true });
      scan();
    }
  };

  // Detect Angular: poll until bootstrapped, give up after ~15 s.
  let attempts = 0;
  const detect = () => {
    const found = detectAngular(win);
    if (found.kind !== 'pending') return setStatus(found);
    if (++attempts > 50 && document.readyState === 'complete') return setStatus({ kind: 'not-angular' });
    setTimeoutNative(detect, 300);
  };
  post({ type: 'status', pageId, status });
  detect();
}

/** Short label for a picked element, e.g. `<span.price>`. */
function describe(el: Element): string {
  const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean)[0] : '';
  return `<${el.tagName.toLowerCase()}${el.id ? '#' + el.id : cls ? '.' + cls : ''}>`;
}

function needsRetry(r: CapturedRequest): boolean {
  const a = r.attribution;
  return a.confidence === 'none' || (a.instanceId === null && (a.via === 'stack' || a.via === 'route'));
}
