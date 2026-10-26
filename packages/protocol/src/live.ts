/** Live Values (ADR 5): change detection between two reads, and the adaptive read interval. */

interface NamedPreview {
  name: string;
  preview: string;
}

/** Names whose preview changed, plus names added or removed, between two reads of one value list. */
export function diffEntries(before: readonly NamedPreview[], after: readonly NamedPreview[]): string[] {
  const old = new Map(before.map((e) => [e.name, e.preview]));
  const changed: string[] = [];
  for (const e of after) {
    if (old.get(e.name) !== e.preview) changed.push(e.name);
    old.delete(e.name);
  }
  return [...changed, ...old.keys()];
}

/** How often Live Values are re-read: every 250 ms, doubling up to 1 s while reads exceed ~8 ms. */
export class LiveThrottle {
  static readonly BASE_MS = 250;
  static readonly MAX_MS = 1000;
  static readonly BUDGET_MS = 8;
  interval = LiveThrottle.BASE_MS;

  get throttled(): boolean {
    return this.interval > LiveThrottle.BASE_MS;
  }

  /** Records how long one read took and adjusts the interval. */
  record(readMs: number): void {
    if (readMs > LiveThrottle.BUDGET_MS) this.interval = Math.min(LiveThrottle.MAX_MS, this.interval * 2);
    else if (readMs <= LiveThrottle.BUDGET_MS / 2) this.interval = Math.max(LiveThrottle.BASE_MS, this.interval / 2);
  }
}
