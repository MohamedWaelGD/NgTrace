import type { Attribution } from '@ngtrace/protocol';

/** A component instance known to be "current" from the profiler (sync) or propagated across async tasks. */
export interface OwnerRef {
  id: number;
  className: string;
  via: 'lifecycle' | 'listener' | 'async' | 'resource';
  /** Owner Resource, while one of the component's resource loaders runs (ADR 9). */
  resource?: string;
}

export interface ComponentRegistry {
  /** Instance Ids of live instances of a component class (empty when the class is not a known component). */
  liveIds(className: string): number[];
}

/** The router is running guards or resolvers for this route when the request is sent. */
export interface RoutePhase {
  /** Route config path(s) of the target leaf, e.g. `stores/:id`. */
  path: string;
  phase: 'guard' | 'resolve';
  /** The component the route will activate, when known. */
  componentClass: string | null;
}

export interface AttributionInput {
  /** `new Error().stack` captured when the request was sent. */
  stack: string;
  /** Stack captured when the HttpClient observable was created (it may be subscribed much later). */
  creationStack?: string | null;
  syncOwner: OwnerRef | null;
  asyncOwner: OwnerRef | null;
  route?: RoutePhase | null;
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
  'ZoneAwareEffectScheduler', 'PendingTasks', 'PendingTasksInternal', 'Testability', 'ResourceImpl', 'HttpResourceImpl',
  'BaseWritableResource',
  // @angular/common/http
  'HttpClient', 'HttpXhrBackend', 'FetchBackend', 'HttpInterceptorHandler', 'HttpHandler', 'HttpBackend',
  'HttpXsrfInterceptor', 'JsonpClientBackend',
  // @angular/router
  'Router', 'RouterOutlet', 'RouterLink', 'ActivatedRoute', 'NavigationTransitions', 'RouterPreloader',
  // @angular/platform-browser
  'DomRendererFactory2', 'DefaultDomRenderer2', 'EmulatedEncapsulationDomRenderer2', 'EventManager',
  'DomEventsPlugin', 'KeyEventsPlugin', 'EventManagerPlugin',
]);
const FRAMEWORK_RE = /(Subscriber|Subject|Scheduler|Action|ZoneSpec|Observer)$|^ɵ/;
/** A resource's loader running (`resource()`, `httpResource()`, `rxResource()`). */
const RESOURCE_FRAME_RE = /\b_?(Http)?ResourceImpl\b|\bloadEffect\b/;
const RESOURCE_LOADER_STEP = 'resource loader';

export function isFrameworkClass(name: string): boolean {
  return FRAMEWORK_CLASSES.has(name) || FRAMEWORK_RE.test(name);
}

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
  if (isFrameworkClass(head)) return null;
  return head;
}

/**
 * Decides the Owner Component of a request. Precedence (ADR 2): sync profiler context →
 * component frame in the stack → route phase → async-propagated context → Unattributed.
 */
export function attribute(input: AttributionInput): { attribution: Attribution; httpClient: boolean } {
  const frames = parseFrames(input.stack);
  const creationFrames = input.creationStack ? parseFrames(input.creationStack) : [];
  const httpClient = creationFrames.length > 0 || frames.some((f) => HTTP_CLIENT_RE.test(f.fn));
  const transport = httpClient ? 'HttpClient' : input.transport === 'fetch' ? 'fetch' : 'XMLHttpRequest';

  // App classes, outermost (caller) first. Where the observable was created explains the call best;
  // the subscribe site only adds the consumer.
  const sendClasses = appClassesOf(frames);
  const creationClasses = appClassesOf(creationFrames);
  const appClasses = creationClasses.length ? creationClasses : sendClasses;

  const { syncOwner, asyncOwner, registry } = input;
  // A resource loader we could not tie to a component's resource: say so in the Call Chain (ADR 9).
  const knownResource = !!(syncOwner?.resource ?? asyncOwner?.resource);
  const loaderStep = !knownResource && [...frames, ...creationFrames].some((f) => RESOURCE_FRAME_RE.test(f.fn)) ? [RESOURCE_LOADER_STEP] : [];

  const chainFor = (owner: string | null) => {
    const chain = owner && appClasses[0] !== owner ? [owner, ...loaderStep, ...appClasses] : [...loaderStep, ...appClasses];
    return dedupeAdjacent([...chain, transport]);
  };

  const isComponent = (c: string) => registry.liveIds(c).length > 0 || c.endsWith('Component');
  const owners = new Set([syncOwner?.className, asyncOwner?.className, input.route?.componentClass]);
  const service = [...appClasses].reverse().find((c) => !isComponent(c) && !owners.has(c)) ?? null;
  const base = { route: null, service, group: null };

  if (syncOwner) {
    return { httpClient, attribution: fromOwner(syncOwner, syncOwner.via, chainFor(syncOwner.className), base) };
  }

  // Innermost component frame wins: the subscriber first, then the component that created the observable.
  const isLive = (c: string) => registry.liveIds(c).length > 0;
  const component = [...sendClasses].reverse().find(isLive) ?? [...creationClasses].reverse().find(isLive);
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
      attribution: { ...base, instanceId, className: component, confidence: 'stack', via: 'stack', callChain: chainFor(null) },
    };
  }

  // Guards/resolvers: the async context is usually the click that started the navigation, so the route wins.
  const route = input.route;
  if (route) {
    const ids = route.componentClass ? registry.liveIds(route.componentClass) : [];
    return {
      httpClient,
      attribution: {
        ...base,
        instanceId: ids.length === 1 ? ids[0] : null,
        className: route.componentClass,
        confidence: 'context',
        via: 'route',
        route: `${route.path} (${route.phase})`,
        callChain: dedupeAdjacent([`Route ${route.path}`, ...loaderStep, ...appClasses, transport]),
      },
    };
  }

  if (asyncOwner) {
    return { httpClient, attribution: fromOwner(asyncOwner, 'async', chainFor(asyncOwner.className), base) };
  }

  return {
    httpClient,
    attribution: {
      ...base,
      instanceId: null,
      className: null,
      confidence: 'none',
      via: 'none',
      callChain: chainFor(null),
      group: appClasses[0] ?? null,
    },
  };
}

function fromOwner(
  owner: OwnerRef,
  via: Attribution['via'],
  callChain: string[],
  base: Pick<Attribution, 'route' | 'service' | 'group'>,
): Attribution {
  const attribution: Attribution = { ...base, instanceId: owner.id, className: owner.className, confidence: 'context', via, callChain };
  if (owner.resource) attribution.ownerResource = owner.resource;
  return attribution;
}

function appClassesOf(frames: Frame[]): string[] {
  const classes: string[] = [];
  for (const f of frames) {
    if (VENDOR_URL_RE.test(f.url)) continue;
    const cls = classOf(f.fn);
    if (cls && classes[0] !== cls) classes.unshift(cls);
  }
  return classes;
}

function dedupeAdjacent(xs: string[]): string[] {
  return xs.filter((x, i) => i === 0 || xs[i - 1] !== x);
}
