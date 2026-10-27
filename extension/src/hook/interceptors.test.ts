import { describe, expect, it } from 'vitest';
import { firstValueFrom, Observable, of, retry, type Observer } from 'rxjs';
import type { CapturedRequest, InterceptorStep } from '@ngtrace/protocol';
import { AngularInternals } from './angular-internals';
import { InterceptorTracker } from './interceptors';

/** Minimal stand-ins for Angular's HttpHeaders / HttpParams / HttpRequest (immutable, clone()). */
class FakeHeaders {
  constructor(readonly map = new Map<string, string>()) {}
  keys() {
    return [...this.map.keys()];
  }
  getAll(name: string) {
    return this.map.has(name) ? [this.map.get(name)!] : null;
  }
}
class FakeParams extends FakeHeaders {}
class FakeRequest {
  constructor(
    readonly method: string,
    readonly url: string,
    readonly headers = new FakeHeaders(),
    readonly params = new FakeParams(),
    readonly body: unknown = null,
  ) {}
  clone(update: { setHeaders?: Record<string, string> }) {
    const map = new Map(this.headers.map);
    for (const [k, v] of Object.entries(update.setHeaders ?? {})) map.set(k, v);
    return new FakeRequest(this.method, this.url, new FakeHeaders(map), this.params, this.body);
  }
}

type Next = (req: FakeRequest) => Observable<unknown>;
type InterceptorFn = (req: FakeRequest, next: Next) => Observable<unknown>;

const token = (desc: string) => ({ _desc: desc, toString: () => `InjectionToken ${desc}` });
const FNS = token('HTTP_INTERCEPTOR_FNS');
const CLASSES = token('HTTP_INTERCEPTORS');
const LEGACY = token('LEGACY_INTERCEPTOR_FN');

/**
 * A fake HttpInterceptorHandler + environment injector built like Angular's: the chain is built
 * once (cached in `chain`) from `injector.get(HTTP_INTERCEPTOR_FNS)`, the legacy fn runs the class
 * interceptors, and the backend "sends" (records a request) when subscribed.
 */
function setup(fns: InterceptorFn[], classes: { intercept(req: FakeRequest, next: { handle: Next }): Observable<unknown> }[] = [], failures = 0) {
  const internals = new AngularInternals();
  const recorded: Partial<CapturedRequest>[] = [];
  let left = failures;
  const backend = (req: FakeRequest) =>
    new Observable<unknown>((subscriber) => {
      const id = `p:${recorded.length + 1}`;
      recorded.push({ id, url: req.url, requestHeaders: [...req.headers.map], ...internals.claimAttempt(id) });
      if (left-- > 0) subscriber.error(new Error('503'));
      else {
        subscriber.next({ status: 200 });
        subscriber.complete();
      }
    });
  const legacy: InterceptorFn = (req, next) =>
    classes.reduceRight<Next>((tail, c) => (r) => c.intercept(r, { handle: tail }), next)(req);
  const values = new Map<unknown, unknown>([
    [FNS, [...fns, legacy]],
    [CLASSES, classes],
    [LEGACY, legacy],
  ]);
  const injector = {
    records: new Map([...values.keys()].map((t) => [t, { value: undefined }])),
    get: (t: unknown) => values.get(t),
  };
  const handler = {
    injector,
    chain: null as Next | null,
    handle(req: FakeRequest) {
      this.chain ??= (injector.get(FNS) as InterceptorFn[]).reduceRight<Next>((tail, fn) => (r) => fn(r, tail), backend);
      return this.chain(req);
    },
  };
  const shortCircuits: { url: string; steps: InterceptorStep[] }[] = [];
  const tracker = new InterceptorTracker(internals, (request, steps, response) => {
    shortCircuits.push({ url: request.url, steps });
    return response;
  });
  internals.onHandler = (h) => tracker.wrapHandler(h);
  class FakeHttpClient {
    handler = handler;
    request(req: FakeRequest) {
      return new Observable<unknown>((subscriber: Observer<unknown>) => this.handler.handle(req).subscribe(subscriber));
    }
  }
  internals.patchHttpClient(FakeHttpClient.prototype);
  return { http: new FakeHttpClient(), recorded, shortCircuits, handler };
}

function authInterceptor(req: FakeRequest, next: Next) {
  return next(req.clone({ setHeaders: { Authorization: 'Bearer t' } }));
}
function loggingInterceptor(req: FakeRequest, next: Next) {
  return next(req);
}
const cache = new Map<string, unknown>([['/api/cached', { status: 200 }]]);
function cacheInterceptor(req: FakeRequest, next: Next) {
  return cache.has(req.url) ? of(cache.get(req.url)) : next(req);
}
function retryingInterceptor(req: FakeRequest, next: Next) {
  return next(req).pipe(retry(1));
}

describe('InterceptorTracker', () => {
  it('records each step in order with what it changed, attached to the request the backend sent', async () => {
    const { http, recorded } = setup([loggingInterceptor, authInterceptor]);
    await firstValueFrom(http.request(new FakeRequest('GET', '/api/products')));
    expect(recorded).toHaveLength(1);
    const steps = recorded[0].interceptorSteps!;
    expect(steps.map((s) => [s.name, s.kind])).toEqual([
      ['loggingInterceptor', 'functional'],
      ['authInterceptor', 'functional'],
    ]);
    expect(steps[0].diff).toEqual({ added: [], removed: [], changed: [], fields: [] });
    expect(steps[1].diff!.added).toEqual([['Authorization', 'Bearer t']]);
    expect(steps[1].shortCircuit).toBe(false);
  });

  it('records class-based interceptors inside the legacy step', async () => {
    const auth = new (class AuthInterceptor {
      intercept(req: FakeRequest, next: { handle: Next }) {
        return next.handle(req.clone({ setHeaders: { 'X-Api': '1' } }));
      }
    })();
    const { http, recorded } = setup([loggingInterceptor], [auth]);
    await firstValueFrom(http.request(new FakeRequest('GET', '/api/products')));
    expect(recorded[0].interceptorSteps!.map((s) => [s.name, s.kind])).toEqual([
      ['loggingInterceptor', 'functional'],
      ['AuthInterceptor', 'class'],
    ]);
    expect(recorded[0].interceptorSteps![1].diff!.added).toEqual([['X-Api', '1']]);
  });

  it('notes a short-circuit and reports the chain, since no request reaches the backend', async () => {
    const { http, recorded, shortCircuits } = setup([authInterceptor, cacheInterceptor, loggingInterceptor]);
    await firstValueFrom(http.request(new FakeRequest('GET', '/api/cached')));
    expect(recorded).toHaveLength(0);
    expect(shortCircuits).toHaveLength(1);
    const steps = shortCircuits[0].steps;
    expect(steps.map((s) => s.name)).toEqual(['authInterceptor', 'cacheInterceptor']);
    expect(steps[1]).toMatchObject({ shortCircuit: true, diff: null });
  });

  it('counts a retry(1) inside an interceptor as a Retry: attempt 2, linked to the first', async () => {
    const { http, recorded } = setup([authInterceptor, retryingInterceptor], [], 1);
    await firstValueFrom(http.request(new FakeRequest('GET', '/api/flaky')));
    expect(recorded.map((r) => [r.id, r.attempt, r.retryOf])).toEqual([
      ['p:1', 1, undefined],
      ['p:2', 2, 'p:1'],
    ]);
    expect(recorded[1].interceptorSteps!.find((s) => s.name === 'retryingInterceptor')!.retries).toBe(1);
  });

  it('wraps each handler once and rebuilds its cached chain', async () => {
    const { http, recorded, handler } = setup([authInterceptor]);
    handler.chain = () => of('stale chain');
    await firstValueFrom(http.request(new FakeRequest('GET', '/api/a')));
    await firstValueFrom(http.request(new FakeRequest('GET', '/api/b')));
    expect(recorded.map((r) => r.interceptorSteps!.map((s) => s.name))).toEqual([['authInterceptor'], ['authInterceptor']]);
  });
});
