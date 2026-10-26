import type { ComponentDetails, InjectedService, InjectorLevel, ProviderInfo, ValueEntry, ValueTarget } from '@ngapi/protocol';
import { isFrameworkClass } from './attribution';
import { InstanceRegistry } from './registry';
import { isInternalKey, preview, type TreeScanner } from './tree';

/* eslint-disable @typescript-eslint/no-explicit-any */

const MAX_ENTRIES = 200;
const MAX_PROVIDERS = 300;

/** Angular-provided DI tokens and classes, hidden behind "show framework" in the panel. */
const FRAMEWORK_TOKEN_RE =
  /^(ɵ|_)|^(Ng|Platform|Router|Http|Dom|Browser|Application|ChangeDetect|Title$|Meta$|Location|Testability|Sanitizer|Renderer|EventManager|ErrorHandler|Injector|Console|ViewportScroller|UrlSerializer|ActivatedRoute|ElementRef|ViewContainerRef|TemplateRef|DestroyRef|Compiler|Image|Xhr|Fetch|Jsonp|TransferState|SharedStyles|Animation|Pending|Effect|Zone|Outlet|ChildrenOutlet|TitleStrategy|RouteReuse|Navigation|Input|Output|Defer|Incremental|Hydration|Stash|IdleScheduler)/;
const FRAMEWORK_INJECTION_TOKEN_RE =
  /^(APP_|PLATFORM_|ENVIRONMENT_|ROUTER_|ROUTES|HTTP_|LOCALE_ID|DEFAULT_|INJECTOR|CSP_NONCE|ANIMATION|IMAGE_|INTERNAL_|REMOVE_STYLES|TESTABILITY|PRECONNECT|IS_|BOOTSTRAP|CHANGE_DETECTION|EFFECTS|DEFER|ZONELESS|SCHEDULE|PROVIDED_|ENABLE_|USE_|NG_|COMPILER|INITIAL_|INPUT_|VIEW|STANDALONE|REQUESTS|XSRF|PENDING|ERROR_|DOCUMENT|EVENT_|HOST_|CURRENCY|DATE_|TRANSLATIONS|MISSING|ANIMATION|NAVIGATION|TITLE|INJECTOR_|SSR|HYDRATION|INTERNAL)/;

/** Reads component state, injected services and the injector path through Angular's dev-mode DI debug APIs. */
export class Inspector {
  private readonly serviceIds = new WeakMap<object, number>();
  private readonly services = new Map<number, WeakRef<object>>();
  private nextServiceId = 1;

  constructor(
    private readonly registry: InstanceRegistry,
    private readonly scanner: TreeScanner,
    private readonly ng: () => any,
  ) {}

  details(id: number): ComponentDetails {
    const ng = this.ng();
    const instance = this.registry.instance(id);
    const el = this.scanner.element(id);
    const empty: ComponentDetails = { id, inputs: [], state: [], services: [], injectorPath: [], diSupported: false };
    if (!instance) return empty;
    const details: ComponentDetails = { ...empty, inputs: this.scanner.inputs(id, ng), state: this.entries(instance) };
    const diSupported = typeof ng['ɵgetDependenciesFromInjectable'] === 'function' && typeof ng['ɵgetInjectorResolutionPath'] === 'function';
    if (!el || !diSupported) return details;
    details.diSupported = true;
    const injector = safe(() => ng.getInjector(el));
    if (!injector) return details;
    details.services = this.injectedServices(ng, injector, instance);
    details.injectorPath = this.injectorPath(ng, injector);
    return details;
  }

  /** False once the service instance was garbage-collected. */
  hasService(id: number): boolean {
    return !!this.services.get(id)?.deref();
  }

  expand(target: ValueTarget, path: string[]): ValueEntry[] {
    let value: unknown = target.kind === 'component' ? this.registry.instance(target.id) : this.services.get(target.id)?.deref();
    for (const key of path) {
      value = this.unwrap(value);
      if (value instanceof Map) value = value.get(mapKey(value, key));
      else if (value instanceof Set) value = [...value][Number(key)];
      else value = safe(() => (value as Record<string, unknown>)?.[key]);
    }
    return this.entries(value);
  }

  private serviceIdOf(value: unknown): number | null {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return null;
    const obj = value as object;
    let id = this.serviceIds.get(obj);
    if (id === undefined) {
      id = this.nextServiceId++;
      this.serviceIds.set(obj, id);
      this.services.set(id, new WeakRef(obj));
    }
    return id;
  }

  private injectedServices(ng: any, injector: any, instance: object): InjectedService[] {
    const result = safe(() => ng['ɵgetDependenciesFromInjectable'](injector, instance.constructor));
    const deps: any[] = result?.dependencies ?? [];
    const seen = new Set<string>();
    const services: InjectedService[] = [];
    for (const dep of deps) {
      const name = tokenName(dep.token);
      if (seen.has(name)) continue;
      seen.add(name);
      services.push({
        name,
        serviceId: this.serviceIdOf(dep.value),
        from: dep.providedIn ? this.injectorLabel(ng, dep.providedIn) : 'unknown',
        framework: isFrameworkToken(dep.token, name),
      });
    }
    return services.sort((a, b) => Number(a.framework) - Number(b.framework));
  }

  private injectorPath(ng: any, injector: any): InjectorLevel[] {
    const path: any[] = safe(() => ng['ɵgetInjectorResolutionPath'](injector)) ?? [];
    const levels = path.map((inj): InjectorLevel => {
      const meta = safe(() => ng['ɵgetInjectorMetadata']?.(inj));
      const kind: InjectorLevel['kind'] = meta?.type === 'element' ? 'element' : meta?.type === 'null' ? 'null' : 'environment';
      return { label: this.injectorLabel(ng, inj), kind, providers: kind === 'null' ? [] : this.providers(ng, inj) };
    });
    // The unnamed environment injector right before the null injector is the platform injector.
    const nullIndex = levels.findIndex((l) => l.kind === 'null');
    const platform = levels[nullIndex - 1];
    if (platform?.kind === 'environment' && platform.label === 'Environment') platform.label = 'platform';
    return levels;
  }

  private providers(ng: any, inj: any): ProviderInfo[] {
    const records: any[] = safe(() => ng['ɵgetInjectorProviders'](inj)) ?? [];
    const values = inj?.records instanceof Map ? (inj.records as Map<unknown, { value?: unknown }>) : null;
    const notYet = values ? notYetSentinel(values) : undefined;
    const seen = new Set<string>();
    const result: ProviderInfo[] = [];
    for (const record of records.slice(0, MAX_PROVIDERS)) {
      const name = tokenName(record.token);
      if (seen.has(name)) continue;
      seen.add(name);
      let created: boolean | null = null;
      let serviceId: number | null = null;
      if (values) {
        const value = values.get(record.token)?.value;
        created = value !== undefined && value !== notYet;
        if (created) serviceId = this.serviceIdOf(value);
      }
      result.push({ name, created, serviceId, framework: isFrameworkToken(record.token, name) });
    }
    return result.sort((a, b) => Number(a.framework) - Number(b.framework));
  }

  private injectorLabel(ng: any, inj: any): string {
    const meta = safe(() => ng['ɵgetInjectorMetadata']?.(inj));
    if (meta?.type === 'element' && meta.source instanceof Element) {
      const owner = safe(() => ng.getComponent?.(meta.source));
      const tag = `<${meta.source.tagName.toLowerCase()}>`;
      return owner && InstanceRegistry.isComponent(owner) ? `${tag} ${InstanceRegistry.classNameOf(owner)}` : tag;
    }
    if (meta?.type === 'null') return 'Null injector';
    const source = typeof meta?.source === 'string' && meta.source ? meta.source : null;
    if (source === 'Environment Injector') return 'root';
    return source ?? 'Environment';
  }

  private unwrap(value: unknown): unknown {
    const ng = this.ng();
    if (typeof value === 'function' && safe(() => ng.isSignal?.(value))) return safe(() => (value as () => unknown)());
    return value;
  }

  private entries(raw: unknown): ValueEntry[] {
    const value = this.unwrap(raw);
    if (!value || typeof value !== 'object') return [];
    const pairs: [string, unknown][] =
      value instanceof Map
        ? [...value].map(([k, v]) => [String(k), v])
        : value instanceof Set
          ? [...value].map((v, i) => [String(i), v])
          : Object.keys(value)
              .filter((k) => !isInternalKey(k))
              .map((k) => [k, safe(() => (value as Record<string, unknown>)[k])]);
    return pairs.slice(0, MAX_ENTRIES).map(([name, v]) => {
      const isSignal = typeof v === 'function' && !!safe(() => this.ng().isSignal?.(v));
      const inner = isSignal ? this.unwrap(v) : v;
      return {
        name,
        preview: isSignal ? `Signal(${preview(inner)})` : preview(inner),
        expandable: !!inner && typeof inner === 'object' && !(inner instanceof Date) && hasKeys(inner),
      };
    });
  }
}

function tokenName(token: any): string {
  if (typeof token === 'function') return (token['ɵcmp']?.debugInfo?.className || token.name || 'Anonymous').replace(/^_+/, '');
  if (token && typeof token === 'object' && typeof token._desc === 'string') return token._desc;
  return String(token);
}

function isFrameworkToken(token: any, name: string): boolean {
  if (typeof token === 'function') return isFrameworkClass(name) || FRAMEWORK_TOKEN_RE.test(name);
  return FRAMEWORK_INJECTION_TOKEN_RE.test(name);
}

/** R3Injector marks not-yet-created records with one shared sentinel object; it is the most repeated value. */
function notYetSentinel(records: Map<unknown, { value?: unknown }>): unknown {
  const counts = new Map<unknown, number>();
  for (const r of records.values()) {
    const v = r?.value;
    if (v && typeof v === 'object' && Object.keys(v).length === 0) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: unknown;
  let max = 1;
  for (const [v, n] of counts) {
    if (n > max) {
      best = v;
      max = n;
    }
  }
  return best;
}

function hasKeys(value: object): boolean {
  if (value instanceof Map || value instanceof Set) return value.size > 0;
  return Object.keys(value).length > 0;
}

function mapKey(map: Map<unknown, unknown>, key: string): unknown {
  for (const k of map.keys()) if (String(k) === key) return k;
  return key;
}

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}
