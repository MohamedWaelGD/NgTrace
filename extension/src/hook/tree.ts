import type { AngularStatus, InputValue, TreeNode } from '@ngapi/protocol';
import { InstanceRegistry } from './registry';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface NgGlobals {
  getComponent?: (el: Element) => object | null;
  isSignal?: (v: unknown) => boolean;
}

export function detectAngular(win: any): AngularStatus {
  const versioned = win.document.querySelector('[ng-version]');
  const version: string | null = versioned?.getAttribute('ng-version') ?? null;
  if (typeof win.ng?.getComponent === 'function') {
    return { kind: 'dev', version, zone: typeof win.Zone !== 'undefined' };
  }
  if (versioned) return { kind: 'production', version };
  return { kind: 'pending' };
}

/** Walks the DOM and builds the component tree (Ghost Nodes kept for destroyed instances). */
export class TreeScanner {
  private nodes = new Map<number, TreeNode>();
  private readonly elements = new Map<number, WeakRef<Element>>();
  private readonly elementIds = new WeakMap<Element, number>();

  constructor(private readonly registry: InstanceRegistry) {}

  scan(doc: Document, ng: NgGlobals): TreeNode[] {
    const getComponent = ng.getComponent;
    if (!getComponent) return [...this.nodes.values()];
    const seen = new Set<number>();
    let root = -1;
    const visit = (el: Element, parentId: number | null) => {
      let nextParent = parentId;
      if ((el as any).__ngContext__ !== undefined) {
        const instance = safe(() => getComponent(el));
        if (instance && InstanceRegistry.isComponent(instance)) {
          const id = this.registry.idOf(instance);
          if (parentId === null) root++;
          seen.add(id);
          this.nodes.set(id, {
            id,
            name: InstanceRegistry.classNameOf(instance),
            selector: selectorOf(instance, el),
            parentId,
            root,
            destroyed: false,
          });
          this.elements.set(id, new WeakRef(el));
          this.elementIds.set(el, id);
          nextParent = id;
        }
      }
      for (const child of Array.from(el.children)) visit(child, nextParent);
    };
    if (doc.body) visit(doc.body, null);
    for (const node of this.nodes.values()) {
      if (!seen.has(node.id) && !node.destroyed) {
        node.destroyed = true;
        this.registry.markDestroyed(node.id);
      }
    }
    return [...this.nodes.values()];
  }

  /** Drops Ghost Nodes (on Clear). */
  dropGhosts(): void {
    for (const [id, node] of this.nodes) {
      if (node.destroyed) {
        this.nodes.delete(id);
        this.elements.delete(id);
        this.registry.forget(id);
      }
    }
  }

  element(id: number): Element | undefined {
    return this.elements.get(id)?.deref();
  }

  /** Nearest component host at or above `el`. */
  ownerOf(el: Element | null): number | null {
    for (let e = el; e; e = e.parentElement) {
      const id = this.elementIds.get(e);
      if (id !== undefined && !this.nodes.get(id)?.destroyed) return id;
    }
    return null;
  }

  inputs(id: number, ng: NgGlobals): InputValue[] {
    const instance = this.registry.instance(id) as Record<string, unknown> | undefined;
    const def = InstanceRegistry.defOf(instance);
    if (!instance || !def?.inputs) return [];
    return Object.entries(def.inputs).map(([publicName, spec]) => {
      const prop = typeof spec === 'string' ? spec : String((spec as unknown[])[0]);
      let value = safe(() => instance[prop]);
      if (typeof value === 'function' && safe(() => ng.isSignal?.(value))) value = safe(() => (value as () => unknown)());
      return { name: publicName, preview: preview(value) };
    });
  }
}

/** Angular's own bookkeeping on instances (e.g. `__ngContext__`). */
export function isInternalKey(key: string): boolean {
  return key.startsWith('__ng') || key.startsWith('ɵ');
}

function selectorOf(instance: object, el: Element): string {
  const first = InstanceRegistry.defOf(instance)?.selectors?.[0];
  const tag = Array.isArray(first) && typeof first[0] === 'string' && first[0] ? first[0] : null;
  return tag ?? el.tagName.toLowerCase();
}

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

/** Short, safe, read-only rendering of an input value. */
/** Set by the hook once Angular is detected; lets previews show signal values. */
export const previewOptions: { isSignal: (v: unknown) => boolean } = { isSignal: () => false };

export function preview(value: unknown, depth = 0): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return JSON.stringify(value.length > 80 ? value.slice(0, 80) + '…' : value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (typeof value === 'function') {
    if (previewOptions.isSignal(value)) return `Signal(${depth >= 2 ? '…' : preview((value as () => unknown)(), depth + 1)})`;
    return `ƒ ${value.name || 'anonymous'}()`;
  }
  if (typeof value === 'symbol') return value.toString();
  if (value instanceof Date) return value.toISOString();
  const ctor = (value as object).constructor;
  const prefix = ctor && ctor !== Object && !Array.isArray(value) ? `${(ctor.name || '').replace(/^_+/, '')} ` : '';
  if (value instanceof Map || value instanceof Set) return `${prefix.trim()}(${value.size})`;
  if (depth >= 2) return Array.isArray(value) ? `Array(${value.length})` : `${prefix}{…}`;
  if (Array.isArray(value)) {
    const items = value.slice(0, 5).map((v) => preview(v, depth + 1));
    return `[${items.join(', ')}${value.length > 5 ? `, … ${value.length - 5} more` : ''}]`;
  }
  const entries = Object.entries(value as object)
    .filter(([k]) => !isInternalKey(k))
    .slice(0, 6);
  const body = entries.map(([k, v]) => `${k}: ${preview(v, depth + 1)}`).join(', ');
  const more = Object.keys(value as object).length > 6 ? ', …' : '';
  return `${prefix}{${body}${more}}`;
}
