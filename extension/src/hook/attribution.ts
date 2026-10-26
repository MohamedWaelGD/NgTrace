import type { Attribution } from '@ngapi/protocol';

/** A component instance known to be "current" from the profiler (sync) or propagated across async tasks. */
export interface OwnerRef {
  id: number;
  className: string;
  via: 'lifecycle' | 'listener' | 'async';
}

export interface ComponentRegistry {
  /** Instance Ids of live instances of a component class (empty when the class is not a known component). */
  liveIds(className: string): number[];
}

export interface AttributionInput {
  /** `new Error().stack` captured when the request was sent. */
  stack: string;
  syncOwner: OwnerRef | null;
  asyncOwner: OwnerRef | null;
  transport: 'fetch' | 'xhr';
  registry: ComponentRegistry;
}

interface Frame {
  fn: string;
  url: string;
}

const FRAME_RE = /^\s*at (?:async )?(?:(.+?) \()?(.+?):\d+:\d+\)?$/;
const VENDOR_URL_RE = /node_modules|\.vite\/deps|polyfills|zone(\.min)?\.js|chrome-extension:|vendor\.js|\/@vite\/|\/@angular\//;
const HTTP_CLIENT_RE = /\b_?(HttpClient|HttpXhrBackend|FetchBackend|HttpInterceptorHandler)\b/;
const TEMPLATE_FN_RE = /^_?([A-Z]\w*?)_(Template|HostBindings|ContentQueries|Query)(?=_|$)/;
const BUILTINS = new Set([
  'Object', 'Array', 'Function', 'Promise', 'Generator', 'AsyncGenerator', 'Map', 'Set', 'WeakMap', 'Reflect', 'Proxy',
  'Window', 'Document', 'EventTarget', 'XMLHttpRequest', 'MutationObserver', 'Zone', 'ZoneDelegate', 'ZoneTask', 'Error',
]);
/**
 * Framework classes. `ng build` bundles them into the same files as app code, so URL filtering
 * alone cannot tell them apart (with `ng serve` they come from /.vite/deps and are filtered by URL).
 */
const FRAMEWORK_CLASSES = new Set([
  // rxjs
  'Observable', 'Subscription', 'Notification', 'ConnectableObservable', 'GroupedObservable',
  // @angular/core
  'NgZone', 'NoopNgZone', 'ApplicationRef', 'ApplicationInitStatus', 'PlatformRef', 'ComponentFactory', 'ComponentRef',
  'ComponentRef$1', 'NodeInjectorFactory', 'NodeInjector', 'R3Injector', 'EnvironmentInjector', 'EventEmitter',
  'EventEmitter_', 'ViewRef', 'ViewRef$1', 'RootViewRef', 'ChangeDetectionSchedulerImpl', 'EffectScheduler',
  'ZoneAwareEffectScheduler', 'PendingTasks', 'PendingTasksInternal', 'Testability',
  // @angular/common/http
  'HttpClient', 'HttpXhrBackend', 'FetchBackend', 'HttpInterceptorHandler', 'HttpHandler', 'HttpBackend',
  'HttpXsrfInterceptor', 'JsonpClientBackend',
  // @angular/router
  'Router', 'RouterOutlet', 'RouterLink', 'ActivatedRoute', 'NavigationTransitions', 'RouterPreloader',
  // @angular/platform-browser
  'DomRendererFactory2', 'DefaultDomRenderer2', 'EmulatedEncapsulationDomRenderer2', 'EventManager',
  'DomEventsPlugin', 'KeyEventsPlugin', 'EventManagerPlugin',
]);
const FRAMEWORK_RE = /(Subscriber|Subject|Scheduler|Action|ZoneSpec)$|^ɵ/;

function parseFrames(stack: string): Frame[] {
  const frames: Frame[] = [];
  for (const line of stack.split('\n')) {
    const m = FRAME_RE.exec(line);
    if (m) frames.push({ fn: m[1] ?? '', url: m[2] });
  }
  return frames;
}

/** Extracts the app class a frame's function belongs to, e.g. `_ProductService.getAll` → `ProductService`. */
function classOf(fn: string): string | null {
  const name = fn.replace(/^new /, '');
  const template = TEMPLATE_FN_RE.exec(name);
  if (template) return template[1];
  const head = name.split('.')[0].replace(/^_+/, '');
  if (!/^[A-Z][\w$]*$/.test(head)) return null;
  if (BUILTINS.has(head) || /^(HTML|SVG)\w*Element$/.test(head)) return null;
  if (FRAMEWORK_CLASSES.has(head) || FRAMEWORK_RE.test(head)) return null;
  return head;
}

/**
 * Decides the Owner Component of a request. Precedence (ADR 2): sync profiler context →
 * component frame in the stack → async-propagated context → Unattributed.
 */
export function attribute(input: AttributionInput): { attribution: Attribution; httpClient: boolean } {
  const frames = parseFrames(input.stack);
  const httpClient = frames.some((f) => HTTP_CLIENT_RE.test(f.fn));
  const transport = httpClient ? 'HttpClient' : input.transport === 'fetch' ? 'fetch' : 'XMLHttpRequest';

  // App classes, outermost (caller) first.
  const appClasses: string[] = [];
  for (const f of frames) {
    if (VENDOR_URL_RE.test(f.url)) continue;
    const cls = classOf(f.fn);
    if (cls && appClasses[0] !== cls) appClasses.unshift(cls);
  }

  const chainFor = (owner: string | null) => {
    const chain = owner && appClasses[0] !== owner ? [owner, ...appClasses] : [...appClasses];
    return dedupeAdjacent([...chain, transport]);
  };

  const { syncOwner, asyncOwner, registry } = input;
  if (syncOwner) {
    return { httpClient, attribution: fromOwner(syncOwner, 'context', syncOwner.via, chainFor(syncOwner.className)) };
  }

  // Innermost component frame wins: it is the component whose code made the call.
  const component = [...appClasses].reverse().find((c) => registry.liveIds(c).length > 0);
  if (component) {
    const ids = registry.liveIds(component);
    const instanceId =
      asyncOwner && asyncOwner.className === component && ids.includes(asyncOwner.id)
        ? asyncOwner.id
        : ids.length === 1
          ? ids[0]
          : null;
    return {
      httpClient,
      attribution: { instanceId, className: component, confidence: 'stack', via: 'stack', callChain: chainFor(null), group: null },
    };
  }

  if (asyncOwner) {
    return { httpClient, attribution: fromOwner(asyncOwner, 'context', 'async', chainFor(asyncOwner.className)) };
  }

  return {
    httpClient,
    attribution: {
      instanceId: null,
      className: null,
      confidence: 'none',
      via: 'none',
      callChain: chainFor(null),
      group: appClasses[0] ?? null,
    },
  };
}

function fromOwner(owner: OwnerRef, confidence: Attribution['confidence'], via: Attribution['via'], callChain: string[]): Attribution {
  return { instanceId: owner.id, className: owner.className, confidence, via, callChain, group: null };
}

function dedupeAdjacent(xs: string[]): string[] {
  return xs.filter((x, i) => i === 0 || xs[i - 1] !== x);
}
