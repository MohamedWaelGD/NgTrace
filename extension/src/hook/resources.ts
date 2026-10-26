import type { OwnerContext } from './context';
import { InstanceRegistry } from './registry';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Duck-typed Angular ResourceImpl (`resource()`, `httpResource()`, `rxResource()`): private, writable fields. */
function isResource(value: any): value is { loaderFn: (...args: unknown[]) => unknown; debugName?: string } {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof value.loaderFn === 'function' &&
    !!value.effectRef &&
    typeof value.value === 'function' &&
    typeof value.status === 'function'
  );
}

/**
 * Owner Resources (ADR 9): when a component instance is first seen, wraps the loader of each
 * resource held in its own fields, so a request the loader sends synchronously is attributed to
 * that resource and the component, at `context` confidence.
 */
export class ResourceTracker {
  private readonly scanned = new WeakSet<object>();
  private readonly wrapped = new WeakSet<object>();

  constructor(
    private readonly context: OwnerContext,
    private readonly registry: InstanceRegistry,
  ) {}

  scan(instance: object): void {
    if (this.scanned.has(instance)) return;
    this.scanned.add(instance);
    const className = InstanceRegistry.classNameOf(instance);
    for (const key of Object.keys(instance)) {
      let value: unknown;
      try {
        value = (instance as Record<string, unknown>)[key];
      } catch {
        continue;
      }
      if (!isResource(value) || this.wrapped.has(value)) continue;
      this.wrapped.add(value);
      const owner = {
        id: this.registry.idOf(instance),
        className,
        via: 'resource' as const,
        resource: `${className}.${value.debugName || key}`,
      };
      const original = value.loaderFn;
      const context = this.context;
      value.loaderFn = function (this: unknown, ...args: unknown[]) {
        return context.runAs(owner, () => original.apply(this, args));
      };
    }
  }
}
