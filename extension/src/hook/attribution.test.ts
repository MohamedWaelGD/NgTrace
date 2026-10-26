import { describe, expect, it } from 'vitest';
import { attribute, type OwnerRef } from './attribution';

const APP = 'http://localhost:4200/main.js';
const CHUNK = 'http://localhost:4200/chunk-ABC.js';
const VENDOR = 'http://localhost:4200/@fs/D:/app/.angular/vite-root/x/.vite/deps/@angular_common_http.js?v=1';
const RX = 'http://localhost:4200/@fs/D:/app/node_modules/.vite/deps/rxjs.js';
const HOOK = 'chrome-extension://abcdef/hook.js';

/** Builds a V8-style stack, innermost frame first, like `new Error().stack`. */
const stack = (...frames: [fn: string | null, url: string][]) =>
  'Error\n' + frames.map(([fn, url]) => (fn ? `    at ${fn} (${url}:1:2)` : `    at ${url}:1:2`)).join('\n');

const httpClientStack = (...app: [string | null, string][]) =>
  stack(
    ['XMLHttpRequest.send', HOOK],
    ['Observable._subscribe', VENDOR],
    ['HttpXhrBackend.handle', VENDOR],
    ['_HttpClient.request', VENDOR],
    ['Observable.subscribe', RX],
    ...app,
  );

const registry = (classes: Record<string, number[]>) => ({ liveIds: (name: string) => classes[name] ?? [] });

describe('attribute', () => {
  it('uses the sync profiler context (lifecycle hook / listener) first', () => {
    const owner: OwnerRef = { id: 7, className: 'ProductListComponent', via: 'listener' };
    const result = attribute({
      stack: httpClientStack(['_ProductService.getAll', APP], ['_ProductListComponent.load', APP]),
      syncOwner: owner,
      asyncOwner: null,
      transport: 'xhr',
      registry: registry({ ProductListComponent: [7, 8] }),
    });
    expect(result.httpClient).toBe(true);
    expect(result.attribution).toEqual({
      instanceId: 7,
      className: 'ProductListComponent',
      confidence: 'context',
      via: 'listener',
      callChain: ['ProductListComponent', 'ProductService', 'HttpClient'],
      group: null,
    });
  });

  it('falls back to a component frame in the stack, resolving a single live instance', () => {
    const result = attribute({
      stack: httpClientStack(['_ProductService.getAll', CHUNK], ['new _DashboardComponent', APP]),
      syncOwner: null,
      asyncOwner: null,
      transport: 'xhr',
      registry: registry({ DashboardComponent: [3] }),
    });
    expect(result.attribution).toMatchObject({ instanceId: 3, className: 'DashboardComponent', confidence: 'stack', via: 'stack' });
  });

  it('recognises template listener functions as their component', () => {
    const result = attribute({
      stack: stack(['window.fetch', HOOK], ['CartComponent_Template_button_click_3_listener', APP]),
      syncOwner: null,
      asyncOwner: null,
      transport: 'fetch',
      registry: registry({ CartComponent: [2] }),
    });
    expect(result.httpClient).toBe(false);
    expect(result.attribution).toMatchObject({
      instanceId: 2,
      className: 'CartComponent',
      confidence: 'stack',
      callChain: ['CartComponent', 'fetch'],
    });
  });

  it('keeps only the class when several instances are live and no context disambiguates', () => {
    const result = attribute({
      stack: httpClientStack(['_ProductCardComponent.ngOnInit', APP]),
      syncOwner: null,
      asyncOwner: null,
      transport: 'xhr',
      registry: registry({ ProductCardComponent: [10, 11, 12] }),
    });
    expect(result.attribution).toMatchObject({ instanceId: null, className: 'ProductCardComponent', confidence: 'stack' });
  });

  it('uses the async context instance when it matches the class found in the stack', () => {
    const result = attribute({
      stack: httpClientStack(['_ProductCardComponent.refresh', APP]),
      syncOwner: null,
      asyncOwner: { id: 11, className: 'ProductCardComponent', via: 'async' },
      transport: 'xhr',
      registry: registry({ ProductCardComponent: [10, 11, 12] }),
    });
    expect(result.attribution).toMatchObject({ instanceId: 11, confidence: 'stack' });
  });

  it('uses the async context when the stack has no component (debounced search)', () => {
    const result = attribute({
      stack: httpClientStack(['_SearchService.search', APP], [null, APP], ['AsyncAction._execute', RX]),
      syncOwner: null,
      asyncOwner: { id: 5, className: 'SearchComponent', via: 'async' },
      transport: 'xhr',
      registry: registry({}),
    });
    expect(result.attribution).toEqual({
      instanceId: 5,
      className: 'SearchComponent',
      confidence: 'context',
      via: 'async',
      callChain: ['SearchComponent', 'SearchService', 'HttpClient'],
      group: null,
    });
  });

  it('leaves requests Unattributed, grouped by the outermost app class', () => {
    const result = attribute({
      stack: httpClientStack(['_ProductService.getAll', APP], ['ProductEffects.loadAll', APP]),
      syncOwner: null,
      asyncOwner: null,
      transport: 'xhr',
      registry: registry({}),
    });
    expect(result.attribution).toEqual({
      instanceId: null,
      className: null,
      confidence: 'none',
      via: 'none',
      callChain: ['ProductEffects', 'ProductService', 'HttpClient'],
      group: 'ProductEffects',
    });
  });

  it('drops framework classes when they are bundled into the same file as app code (ng build)', () => {
    const result = attribute({
      stack: stack(
        ['window.fetch', HOOK],
        ['_FetchBackend.doRequest', APP],
        ['_NgZone.runOutsideAngular', APP],
        ['Observable._subscribe', APP],
        ['OperatorSubscriber._next', APP],
        ['SafeSubscriber.next', APP],
        ['BehaviorSubject.subscribe', APP],
        ['AsyncStackTaggingZoneSpec.onInvokeTask', 'http://localhost:4200/polyfills.js'],
        ['_ApplicationInitStatus.runInitializers', APP],
        ['_ApplicationRef.tick', APP],
        ['_OrderService.place', APP],
        ['_CheckoutComponent.submit', APP],
      ),
      syncOwner: null,
      asyncOwner: null,
      transport: 'fetch',
      registry: registry({ CheckoutComponent: [1] }),
    });
    expect(result.httpClient).toBe(true);
    expect(result.attribution.callChain).toEqual(['CheckoutComponent', 'OrderService', 'HttpClient']);
  });

  it('does not treat builtins or DOM frames as app classes', () => {
    const result = attribute({
      stack: stack(['XMLHttpRequest.send', HOOK], ['HTMLButtonElement.<anonymous>', APP], ['Object.next', APP], ['Array.forEach', APP]),
      syncOwner: null,
      asyncOwner: null,
      transport: 'xhr',
      registry: registry({}),
    });
    expect(result.attribution.callChain).toEqual(['XMLHttpRequest']);
    expect(result.attribution.group).toBeNull();
  });
});
