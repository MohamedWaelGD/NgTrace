import { diffRequests, type InterceptorStep, type RequestSnapshot } from '@ngtrace/protocol';
import type { AngularInternals, SendSlot } from './angular-internals';

/* eslint-disable @typescript-eslint/no-explicit-any */

const BODY_PREVIEW_CHARS = 2000;

/**
 * Called when an interceptor answers without calling `next` (e.g. from a cache): nothing reaches the
 * network, so the hook records the request itself. Returns the observable to hand back to the chain.
 */
export type ShortCircuitRecorder = (request: RequestSnapshot, steps: InterceptorStep[], response: any) => any;

/**
 * Interceptor Steps (ADR 10): wraps every `HTTP_INTERCEPTOR_FNS` entry and each `HTTP_INTERCEPTORS`
 * instance's `intercept` of an HttpClient handler, then clears the handler's cached chain so Angular
 * rebuilds it with the wrappers. Dev builds only: the tokens are found by their debug names.
 */
export class InterceptorTracker {
  private readonly handlers = new WeakSet<object>();
  private readonly wrapped = new WeakSet<object>();

  constructor(
    private readonly internals: AngularInternals,
    private readonly onShortCircuit: ShortCircuitRecorder,
  ) {}

  /** Once per handler: the root one, and each lazy route's child environment injector's own. */
  wrapHandler(handler: any): void {
    if (!handler || typeof handler !== 'object' || this.handlers.has(handler)) return;
    this.handlers.add(handler);
    const injector = handler.injector;
    if (typeof injector?.get !== 'function') return;
    try {
      const tokens = findTokens(injector, ['HTTP_INTERCEPTOR_FNS', 'HTTP_ROOT_INTERCEPTOR_FNS', 'HTTP_INTERCEPTORS', 'LEGACY_INTERCEPTOR_FN']);
      if (!tokens.has('HTTP_INTERCEPTOR_FNS')) return;
      const get = (name: string) => (tokens.has(name) ? safe(() => injector.get(tokens.get(name), null)) : null);
      // Runs the class-based interceptors: they get their own steps, it does not.
      const legacy = get('LEGACY_INTERCEPTOR_FN');
      for (const name of ['HTTP_INTERCEPTOR_FNS', 'HTTP_ROOT_INTERCEPTOR_FNS']) {
        const fns = get(name);
        if (!Array.isArray(fns)) continue;
        fns.forEach((fn, i) => {
          if (typeof fn === 'function' && fn !== legacy && !this.wrapped.has(fn)) fns[i] = this.wrapFunctional(fn);
        });
      }
      const classes = get('HTTP_INTERCEPTORS');
      if (Array.isArray(classes)) for (const instance of classes) this.wrapClass(instance);
      handler.chain = null;
    } catch {
      // Interceptor internals differ across versions: requests are still recorded, without steps.
    }
  }

  private wrapFunctional(fn: (req: any, next: (req: any) => any) => any): typeof fn {
    const tracker = this;
    const name = fn.name || 'anonymous';
    const wrapper = function (this: unknown, req: any, next: (req: any) => any) {
      return tracker.run(name, 'functional', req, next, (wrappedNext) => fn.call(this, req, wrappedNext));
    };
    this.wrapped.add(wrapper);
    return wrapper;
  }

  private wrapClass(instance: any): void {
    if (!instance || typeof instance.intercept !== 'function' || this.wrapped.has(instance)) return;
    this.wrapped.add(instance);
    const tracker = this;
    const intercept = instance.intercept;
    const name = (instance.constructor?.name || 'anonymous').replace(/^_+/, '');
    instance.intercept = function (this: unknown, req: any, handler: { handle: (req: any) => any }) {
      return tracker.run(name, 'class', req, (r) => handler.handle(r), (wrappedNext) => intercept.call(this, req, { handle: wrappedNext }));
    };
  }

  /** Runs one interceptor, recording its step in the send in progress. */
  private run(name: string, kind: InterceptorStep['kind'], req: any, next: (req: any) => any, call: (next: (req: any) => any) => any): any {
    const slot = this.internals.currentSlot();
    const step: InterceptorStep = { name, kind, diff: null, shortCircuit: false, retries: 0 };
    slot?.steps.push(step);
    const received = snapshot(req);
    let calledNext = false;
    const result = call((downstream: any) => {
      calledNext = true;
      step.diff = diffRequests(received, snapshot(downstream));
      return this.watchNext(next(downstream), step, slot);
    });
    if (calledNext) return result;
    step.shortCircuit = true;
    // A step that answered itself ends the chain: nothing reaches the backend to carry the steps.
    return slot ? this.onShortCircuit(received, slot.steps, result) : result;
  }

  /**
   * Counts re-subscriptions of `next` after an error (e.g. `next(req).pipe(retry(1))`) as Retries
   * started by this interceptor; the request each one sends gets the next Attempt Number.
   */
  private watchNext(downstream: any, step: InterceptorStep, slot: SendSlot | null): any {
    const Observable = downstream?.constructor;
    if (!slot || typeof Observable !== 'function' || typeof downstream.subscribe !== 'function') return downstream;
    const internals = this.internals;
    let failed: { attempt: number } | null = null;
    return new Observable((subscriber: any) => {
      const retry = failed;
      failed = null;
      const observer = {
        next: (value: unknown) => subscriber.next(value),
        error: (err: unknown) => {
          failed = { attempt: retry ? retry.attempt : slot.attempt };
          subscriber.error(err);
        },
        complete: () => subscriber.complete(),
      };
      // An async interceptor (e.g. one that awaits a token) subscribes later: the send is still this one.
      if (!retry) return internals.currentSlot() === slot ? downstream.subscribe(observer) : internals.inSlot(slot, () => downstream.subscribe(observer));
      step.retries++;
      const attempt = retry.attempt + 1;
      const again: SendSlot = { attempt, retryOf: slot.retryOf ?? slot.claimedId, claimedId: null, steps: slot.steps };
      return internals.inSlot(again, () =>
        downstream.subscribe({
          ...observer,
          error: (err: unknown) => {
            failed = { attempt };
            subscriber.error(err);
          },
        }),
      );
    });
  }
}

/** Interceptor tokens by debug name (`_desc`, dev builds), searched up the injector chain. */
function findTokens(injector: any, names: string[]): Map<string, unknown> {
  const found = new Map<string, unknown>();
  for (let inj = injector; inj && found.size < names.length; inj = inj.parent) {
    if (!(inj.records instanceof Map)) continue;
    for (const token of inj.records.keys()) {
      const desc = (token as any)?._desc;
      if (typeof desc === 'string' && names.includes(desc) && !found.has(desc)) found.set(desc, token);
    }
  }
  return found;
}

/** A serialisable view of an Angular HttpRequest (duck-typed). */
export function snapshot(req: any): RequestSnapshot {
  const pairs = (map: any): [string, string][] =>
    safe(() => (map?.keys() as string[]).flatMap((k) => (map.getAll(k) ?? []).map((v: unknown) => [k, String(v)] as [string, string]))) ?? [];
  return {
    method: String(req?.method ?? ''),
    url: String(req?.url ?? ''),
    params: pairs(req?.params),
    headers: pairs(req?.headers),
    body: bodyPreview(req?.body),
    bodyRef: req?.body ?? null,
  };
}

function bodyPreview(body: unknown): string | null {
  if (body === null || body === undefined) return null;
  if (typeof body === 'string') return body.slice(0, BODY_PREVIEW_CHARS);
  if (typeof body !== 'object') return String(body);
  const name = (body as object).constructor?.name;
  if (name && name !== 'Object' && name !== 'Array') return `[${name}]`;
  return safe(() => JSON.stringify(body).slice(0, BODY_PREVIEW_CHARS)) ?? '[unserialisable]';
}

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}
