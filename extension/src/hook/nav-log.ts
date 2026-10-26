import type { NavEvent } from '@ngapi/protocol';

// Router EventType values (@angular/router, stable since v14).
const KINDS: Record<number, NavEvent['kind']> = {
  0: 'start',
  1: 'end',
  2: 'cancel',
  3: 'error',
  5: 'resolve-start',
  6: 'resolve-end',
  7: 'guards-start',
  8: 'guards-end',
};

export const NAV_LOG_SIZE = 200;

/** Maps an Angular router event to a Timeline marker, or null for events the Timeline does not show. */
export function navigationEventOf(e: { type?: number; url?: string; urlAfterRedirects?: string } | null, at: number): NavEvent | null {
  const kind = e?.type === undefined ? undefined : KINDS[e.type];
  if (!e || !kind) return null;
  return { kind, url: (kind === 'end' ? e.urlAfterRedirects : undefined) ?? e.url ?? '', at };
}

/** Bounded, ordered list of router events kept in the page next to the request ring buffer. */
export class NavLog {
  private events: NavEvent[] = [];

  constructor(private readonly size = NAV_LOG_SIZE) {}

  add(event: NavEvent): void {
    this.events.push(event);
    if (this.events.length > this.size) this.events.shift();
  }

  all(): NavEvent[] {
    return this.events.slice();
  }

  clear(): void {
    this.events = [];
  }
}
