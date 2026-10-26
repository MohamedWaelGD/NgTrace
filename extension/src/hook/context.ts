import type { OwnerRef } from './attribution';
import { InstanceRegistry } from './registry';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ProfilerEvent values from @angular/core (stable since v12).
const TEMPLATE_CREATE_START = 0;
const LIFECYCLE_HOOK_START = 4;
const LIFECYCLE_HOOK_END = 5;
const OUTPUT_START = 6;
const OUTPUT_END = 7;
const TEMPLATE_UPDATE_END = 3;
const CHANGE_DETECTION_END = 13; // Angular 20+; older versions only report per-template updates.

const OWNER_KEY = '__ngapiOwner';

/**
 * Tracks which component is "current": synchronously from Angular's profiler (lifecycle hooks and
 * template listeners) and asynchronously by tagging timers, microtasks and Zone tasks with the
 * owner that scheduled them (ADR 2).
 */
export class OwnerContext {
  private readonly syncStack: (OwnerRef | null)[] = [];
  asyncOwner: OwnerRef | null = null;
  profilerInstalled = false;
  /** Called with component instances seen by the profiler, until set back to null. */
  onComponent: ((instance: object) => void) | null = null;
  /** Called when a component instance's template is created (before its first effect flush). */
  onTemplateCreate: ((instance: object) => void) | null = null;
  zonePatched = false;
  /** Called when a change-detection pass (or, before Angular 20, a template update) ends. */
  onChangeDetection: (() => void) | null = null;

  constructor(private readonly registry: InstanceRegistry) {}

  sync(): OwnerRef | null {
    for (let i = this.syncStack.length - 1; i >= 0; i--) {
      const o = this.syncStack[i];
      if (o) return o;
    }
    return null;
  }

  current(): OwnerRef | null {
    return this.sync() ?? this.asyncOwner;
  }

  readonly profiler = (event: number, instance: unknown): void => {
    if (this.onComponent && InstanceRegistry.isComponent(instance)) this.onComponent(instance);
    if (event === TEMPLATE_CREATE_START && this.onTemplateCreate && InstanceRegistry.isComponent(instance)) this.onTemplateCreate(instance);
    if (event === LIFECYCLE_HOOK_START || event === OUTPUT_START) {
      this.syncStack.push(
        InstanceRegistry.isComponent(instance)
          ? {
              id: this.registry.idOf(instance),
              className: InstanceRegistry.classNameOf(instance),
              via: event === OUTPUT_START ? 'listener' : 'lifecycle',
            }
          : null,
      );
    } else if (event === LIFECYCLE_HOOK_END || event === OUTPUT_END) {
      this.syncStack.pop();
    } else if (event === CHANGE_DETECTION_END || event === TEMPLATE_UPDATE_END) {
      this.onChangeDetection?.();
    }
  };

  /** Runs `fn` now with `owner` as the sync owner (e.g. a resource loader, ADR 9). */
  runAs<T>(owner: OwnerRef, fn: () => T): T {
    this.syncStack.push(owner);
    try {
      return fn();
    } finally {
      this.syncStack.pop();
    }
  }

  /** Runs `fn` later with the owner that is current now. */
  bind<F extends (...args: any[]) => any>(fn: F): F {
    const owner = this.current();
    if (!owner || typeof fn !== 'function') return fn;
    const ctx = this;
    return function (this: unknown, ...args: unknown[]) {
      const prev = ctx.asyncOwner;
      ctx.asyncOwner = owner;
      try {
        return fn.apply(this, args);
      } finally {
        ctx.asyncOwner = prev;
      }
    } as F;
  }

  /** Installs the profiler as soon as Angular publishes `ng.ɵsetProfiler` (ADR 2). */
  watchAngular(win: any): void {
    const install = (setProfiler: unknown) => {
      if (typeof setProfiler === 'function' && !this.profilerInstalled) {
        setProfiler(this.profiler);
        this.profilerInstalled = true;
      }
    };
    if (win.ng) {
      install(win.ng['ɵsetProfiler']);
      return;
    }
    // Pre-create the `ng` container (Angular does `window.ng ??= {}`) so we see ɵsetProfiler being published.
    const container: Record<string, unknown> = {};
    let setProfiler: unknown;
    Object.defineProperty(container, 'ɵsetProfiler', {
      configurable: true,
      enumerable: true,
      get: () => setProfiler,
      set: (fn) => {
        setProfiler = fn;
        install(fn);
      },
    });
    win.ng = container;
  }

  /** Patches native async APIs so callbacks inherit the owner that scheduled them. */
  patchAsync(win: any): void {
    const ctx = this;
    for (const name of ['setTimeout', 'setInterval', 'requestAnimationFrame', 'queueMicrotask'] as const) {
      const original = win[name];
      if (typeof original !== 'function') continue;
      win[name] = function (this: unknown, cb: unknown, ...rest: unknown[]) {
        return original.call(this, typeof cb === 'function' ? ctx.bind(cb as () => void) : cb, ...rest);
      };
    }
    const then = win.Promise.prototype.then;
    win.Promise.prototype.then = function (this: Promise<unknown>, onFulfilled?: any, onRejected?: any) {
      return then.call(this, onFulfilled && ctx.bind(onFulfilled), onRejected && ctx.bind(onRejected));
    };
    const xhrAdd = win.XMLHttpRequest.prototype.addEventListener;
    win.XMLHttpRequest.prototype.addEventListener = function (this: XMLHttpRequest, type: string, fn: any, opts?: any) {
      return xhrAdd.call(this, type, typeof fn === 'function' ? ctx.bind(fn) : fn, opts);
    };
    this.watchZone(win);
  }

  /** Tags Zone tasks (incl. ZoneAwarePromise microtasks) with their scheduling owner once zone.js loads. */
  private watchZone(win: any): void {
    const patch = (Zone: any) => {
      if (!Zone?.prototype || this.zonePatched) return;
      this.zonePatched = true;
      const ctx = this;
      const { scheduleTask, runTask } = Zone.prototype;
      Zone.prototype.scheduleTask = function (task: any) {
        const owner = ctx.current();
        if (owner) task[OWNER_KEY] = owner;
        return scheduleTask.call(this, task);
      };
      Zone.prototype.runTask = function (task: any, ...rest: unknown[]) {
        const prev = ctx.asyncOwner;
        ctx.asyncOwner = task?.[OWNER_KEY] ?? null;
        try {
          return runTask.call(this, task, ...rest);
        } finally {
          ctx.asyncOwner = prev;
        }
      };
    };
    if (win.Zone) {
      patch(win.Zone);
      return;
    }
    let zone: unknown;
    Object.defineProperty(win, 'Zone', {
      configurable: true,
      enumerable: true,
      get: () => zone,
      set: (value) => {
        zone = value;
        Object.defineProperty(win, 'Zone', { configurable: true, enumerable: true, writable: true, value });
        patch(value);
      },
    });
  }
}
