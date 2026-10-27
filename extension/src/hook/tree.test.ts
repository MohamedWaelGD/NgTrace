// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { REVEAL_GLOBAL } from '@ngtrace/protocol';
import { InstanceRegistry } from './registry';
import { revealElement } from './reveal';
import { TreeScanner } from './tree';

function component(name: string, debugInfo: Record<string, unknown> | null) {
  const ctor = class {};
  Object.defineProperty(ctor, 'name', { value: name });
  (ctor as unknown as Record<string, unknown>)['ɵcmp'] = { selectors: [['app-x']], debugInfo };
  return new ctor();
}

function mount(instance: object) {
  document.body.innerHTML = '<app-x></app-x>';
  const el = document.querySelector('app-x')!;
  (el as unknown as Record<string, unknown>)['__ngContext__'] = 1;
  const ng = { getComponent: (e: Element) => (e === el ? instance : null) };
  return { el, ng };
}

describe('TreeScanner source location', () => {
  it('includes debugInfo filePath and lineNumber (dev builds)', () => {
    const instance = component('ShopComponent', { className: 'ShopComponent', filePath: 'src/app/shop.component.ts', lineNumber: 21 });
    const { ng } = mount(instance);
    const [node] = new TreeScanner(new InstanceRegistry()).scan(document, ng);
    expect(node).toMatchObject({ name: 'ShopComponent', filePath: 'src/app/shop.component.ts', lineNumber: 21 });
  });

  it('leaves them out without debugInfo (production builds)', () => {
    const { ng } = mount(component('ShopComponent', null));
    const [node] = new TreeScanner(new InstanceRegistry()).scan(document, ng);
    expect(node.filePath).toBeUndefined();
    expect(node.lineNumber).toBeUndefined();
  });
});

describe('revealElement', () => {
  it('exposes the host element of a live instance for inspect()', () => {
    const registry = new InstanceRegistry();
    const scanner = new TreeScanner(registry);
    const { el, ng } = mount(component('ShopComponent', null));
    const [node] = scanner.scan(document, ng);
    const win: Record<string, unknown> = {};
    expect(revealElement(win, scanner, registry, node.id)).toBe(true);
    expect(win[REVEAL_GLOBAL]).toBe(el);
  });

  it('reports a destroyed instance (Ghost Node) as gone', () => {
    const registry = new InstanceRegistry();
    const scanner = new TreeScanner(registry);
    const { ng } = mount(component('ShopComponent', null));
    const [node] = scanner.scan(document, ng);
    document.body.innerHTML = '';
    scanner.scan(document, ng);
    const win: Record<string, unknown> = {};
    expect(revealElement(win, scanner, registry, node.id)).toBe(false);
    expect(win[REVEAL_GLOBAL]).toBeNull();
  });
});
