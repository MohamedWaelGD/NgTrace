import type { ComponentRegistry } from './attribution';

/* eslint-disable @typescript-eslint/no-explicit-any */
type ComponentDef = {
  selectors?: unknown[][];
  inputs?: Record<string, string | unknown[]>;
  debugInfo?: { className?: string; filePath?: string; lineNumber?: number } | null;
};

interface Known {
  className: string;
  ref: WeakRef<object>;
  destroyed: boolean;
}

/** Assigns Instance Ids to component instances and tracks which ones are live. */
export class InstanceRegistry implements ComponentRegistry {
  private readonly ids = new WeakMap<object, number>();
  private readonly known = new Map<number, Known>();
  private nextId = 1;

  static defOf(instance: unknown): ComponentDef | null {
    const ctor = (instance as any)?.constructor;
    return (ctor && (ctor['ɵcmp'] as ComponentDef)) || null;
  }

  static isComponent(instance: unknown): instance is object {
    return InstanceRegistry.defOf(instance) !== null;
  }

  static classNameOf(instance: object): string {
    const def = InstanceRegistry.defOf(instance);
    const name = def?.debugInfo?.className || (instance.constructor as { name?: string }).name || 'Anonymous';
    return name.replace(/^_+/, '');
  }

  idOf(instance: object): number {
    let id = this.ids.get(instance);
    if (id === undefined) {
      id = this.nextId++;
      this.ids.set(instance, id);
      this.known.set(id, { className: InstanceRegistry.classNameOf(instance), ref: new WeakRef(instance), destroyed: false });
    }
    return id;
  }

  instance(id: number): object | undefined {
    return this.known.get(id)?.ref.deref();
  }

  markDestroyed(id: number): void {
    const k = this.known.get(id);
    if (k) k.destroyed = true;
  }

  /** True once the instance is destroyed (Ghost Node) or no longer known. */
  isDestroyed(id: number): boolean {
    return this.known.get(id)?.destroyed ?? true;
  }

  forget(id: number): void {
    this.known.delete(id);
  }

  liveIds(className: string): number[] {
    const ids: number[] = [];
    for (const [id, k] of this.known) {
      if (k.className === className && !k.destroyed && k.ref.deref()) ids.push(id);
    }
    return ids;
  }
}
