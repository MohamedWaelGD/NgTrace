import type { RoutePhase } from './attribution';
import { captureStack } from './capture';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Router EventType values (@angular/router, stable since v14).
const ResolveStart = 5;
const ResolveEnd = 6;
const GuardsCheckStart = 7;
const GuardsCheckEnd = 8;
const NavigationEnd = 1;
const NavigationCancel = 2;
const NavigationError = 3;

/** Environment injectors (R3Injector) on the resolution path of a component's host element. */
export function environmentInjectors(ng: any, el: Element): any[] {
  const injector = ng.getInjector?.(el);
  const path: any[] = ng['ɵgetInjectorResolutionPath']?.(injector) ?? [];
  return path.filter((inj) => inj?.records instanceof Map);
}

/**
 * Finds Angular singletons without needing their tokens (which live in the app bundle):
 * duck-types the already-created values and the class tokens of environment injector records.
 */
export class AngularInternals {
  /** Stack captured when the HttpClient observable being subscribed was created. */
  creationStack: string | null = null;
  routePhase: RoutePhase | null = null;
  private routerAttached = false;
  private httpPatched = false;
  private attempts = 0;

  get done(): boolean {
    return this.routerAttached && this.httpPatched;
  }

  /** Called with component instances (from the profiler and tree scans) until both hooks are in place. */
  tryAttach(ng: any, instance: object): void {
    if (this.done || this.attempts > 50) return;
    this.attempts++;
    try {
      const el = ng.getHostElement?.(instance);
      if (!el) return;
      for (const injector of environmentInjectors(ng, el)) {
        for (const [token, record] of injector.records as Map<unknown, { value?: unknown }>) {
          if (!this.httpPatched && isHttpClientClass(token)) this.patchHttpClient(token.prototype);
          if (!this.routerAttached && isRouter(record?.value)) this.watchRouter(record.value);
        }
      }
    } catch {
      // Debug APIs differ across versions: attribution falls back to stack/async context.
    }
  }

  /** Remembers where each HttpClient observable was created, so cold observables keep their caller. */
  private patchHttpClient(proto: any): void {
    this.httpPatched = true;
    const original = proto.request;
    const self = this;
    proto.request = function (this: unknown, ...args: unknown[]) {
      const result = original.apply(this, args);
      const Observable = result?.constructor;
      if (typeof Observable !== 'function' || typeof result.subscribe !== 'function') return result;
      const stack = captureStack();
      return new Observable((subscriber: unknown) => {
        const prev = self.creationStack;
        self.creationStack = stack;
        try {
          return result.subscribe(subscriber);
        } finally {
          self.creationStack = prev;
        }
      });
    };
  }

  private watchRouter(router: any): void {
    this.routerAttached = true;
    router.events.subscribe((e: any) => {
      switch (e?.type) {
        case GuardsCheckStart:
          this.routePhase = routePhaseOf(e.state, 'guard');
          break;
        case ResolveStart:
          this.routePhase = routePhaseOf(e.state, 'resolve');
          break;
        case GuardsCheckEnd:
        case ResolveEnd:
        case NavigationEnd:
        case NavigationCancel:
        case NavigationError:
          this.routePhase = null;
          break;
      }
    });
  }
}

function isHttpClientClass(token: unknown): token is { prototype: any } {
  const proto = typeof token === 'function' ? (token as any).prototype : null;
  return !!proto && ['request', 'jsonp', 'options', 'patch'].every((m) => typeof proto[m] === 'function');
}

function isRouter(value: any): boolean {
  return !!value && typeof value.navigateByUrl === 'function' && typeof value.events?.subscribe === 'function';
}

/** Leaf route of the target state: joined config paths and the component it will activate. */
function routePhaseOf(state: any, phase: RoutePhase['phase']): RoutePhase | null {
  const parts: string[] = [];
  let componentClass: string | null = null;
  for (let node = state?.root; node; node = node.firstChild) {
    const path = node.routeConfig?.path;
    if (path) parts.push(path);
    const component = node.component ?? node.routeConfig?.component;
    if (typeof component === 'function') componentClass = classNameOfType(component);
  }
  return { path: parts.join('/') || '/', phase, componentClass };
}

function classNameOfType(type: any): string {
  return (type['ɵcmp']?.debugInfo?.className || type.name || 'Anonymous').replace(/^_+/, '');
}
