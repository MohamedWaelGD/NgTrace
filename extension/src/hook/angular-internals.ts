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

/** The attempt of an HttpClient observable being subscribed; tags the first request recorded meanwhile. */
interface AttemptSlot {
  attempt: number;
  /** Id of the chain's first attempt; null for a first attempt, or when it was never recorded. */
  retryOf: string | null;
  claimed: boolean;
  onClaim: (id: string) => void;
}

/**
 * Finds Angular singletons without needing their tokens (which live in the app bundle):
 * duck-types the already-created values and the class tokens of environment injector records.
 */
export class AngularInternals {
  /** Stack captured when the HttpClient observable being subscribed was created. */
  creationStack: string | null = null;
  routePhase: RoutePhase | null = null;
  /** Receives every router event (for the Timeline); set by the hook. */
  onRouterEvent: ((event: any) => void) | null = null;
  private routerAttached = false;
  private httpPatched = false;
  private attempts = 0;
  private attemptSlot: AttemptSlot | null = null;

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

  /**
   * Called by the capture layer for each request it records: the Attempt Number (and the first
   * attempt's id, for a Retry) when an HttpClient observable is being subscribed. Only the first
   * request recorded during that subscription is tagged.
   */
  claimAttempt(id: string): { attempt: number; retryOf?: string } | null {
    const slot = this.attemptSlot;
    if (!slot || slot.claimed) return null;
    slot.claimed = true;
    slot.onClaim(id);
    return slot.retryOf === null ? { attempt: slot.attempt } : { attempt: slot.attempt, retryOf: slot.retryOf };
  }

  /**
   * Remembers where each HttpClient observable was created, so cold observables keep their caller,
   * and numbers its subscriptions: one that follows a failed attempt (e.g. `retry()`) is a Retry.
   */
  patchHttpClient(proto: any): void {
    this.httpPatched = true;
    const original = proto.request;
    const self = this;
    proto.request = function (this: unknown, ...args: unknown[]) {
      const result = original.apply(this, args);
      const Observable = result?.constructor;
      if (typeof Observable !== 'function' || typeof result.subscribe !== 'function') return result;
      const stack = captureStack();
      // Set when an attempt fails, consumed by the next subscription; a success clears it.
      let failed: { rootId: string | null; attempt: number } | null = null;
      return new Observable((subscriber: any) => {
        const retry = failed;
        failed = null;
        let rootId = retry?.rootId ?? null;
        const attempt = retry ? retry.attempt + 1 : 1;
        const slot: AttemptSlot = { attempt, retryOf: rootId, claimed: false, onClaim: (id) => (rootId ??= id) };
        const prev = { stack: self.creationStack, slot: self.attemptSlot };
        self.creationStack = stack;
        self.attemptSlot = slot;
        try {
          return result.subscribe({
            next: (value: unknown) => subscriber.next(value),
            error: (err: unknown) => {
              // Before forwarding: retry() re-subscribes synchronously from inside error().
              failed = { rootId, attempt };
              subscriber.error(err);
            },
            complete: () => {
              failed = null;
              subscriber.complete();
            },
          });
        } finally {
          self.creationStack = prev.stack;
          self.attemptSlot = prev.slot;
        }
      });
    };
  }

  private watchRouter(router: any): void {
    this.routerAttached = true;
    router.events.subscribe((e: any) => {
      this.onRouterEvent?.(e);
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
