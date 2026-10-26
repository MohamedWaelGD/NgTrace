import { REVEAL_GLOBAL } from '@ngapi/protocol';
import type { InstanceRegistry } from './registry';
import type { TreeScanner } from './tree';

/** Reveal in Elements: exposes a live component's host element on the page window; false for a Ghost Node. */
export function revealElement(win: Record<string, unknown>, scanner: TreeScanner, registry: InstanceRegistry, id: number): boolean {
  const el = registry.isDestroyed(id) ? undefined : scanner.element(id);
  win[REVEAL_GLOBAL] = el ?? null;
  return !!el;
}
