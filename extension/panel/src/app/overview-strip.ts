import { Component, computed, inject } from '@angular/core';
import { isFailed, statusOf, type CapturedRequest, type StatusChip } from '@ngapi/protocol';
import { formatBytes, formatDuration, responseSize, shortName } from './format';
import { InspectorStore } from './inspector.store';

type Segment = StatusChip | 'pending';

interface Slice {
  id: Segment;
  label: string;
  count: number;
}

const ORDER: { id: Segment; label: string }[] = [
  { id: '2xx', label: '2xx' },
  { id: '3xx', label: '3xx' },
  { id: '4xx', label: '4xx' },
  { id: '5xx', label: '5xx' },
  { id: 'failed', label: 'Failed' },
  { id: 'pending', label: 'Pending' },
];

const isPending = (r: CapturedRequest) => r.status === null && !r.error;
const duration = (r: CapturedRequest) => (r.endTime === null ? -1 : r.endTime - r.startTime);

/**
 * At-a-glance view of the current selection's traffic, before the filter bar narrows it:
 * a status breakdown whose slices toggle the status filter, and totals that jump to what they count.
 */
@Component({
  selector: 'app-overview-strip',
  template: `
    @if (slices().length) {
      <div class="bar" role="group" aria-label="Requests by status">
        @for (s of slices(); track s.id) {
          <button
            class="slice"
            [class]="'k-' + s.id"
            [class.dim]="dimmed(s.id)"
            [style.flex-grow]="s.count"
            [disabled]="s.id === 'pending'"
            [attr.aria-pressed]="s.id === 'pending' ? null : isActive(s.id)"
            [title]="sliceTitle(s)"
            (click)="toggle(s.id)"
            [attr.data-testid]="'overview-slice-' + s.id"
          ></button>
        }
      </div>
      <div class="row">
        <span class="group">
          @for (s of slices(); track s.id) {
            <button
              class="key"
              [class.dim]="dimmed(s.id)"
              [disabled]="s.id === 'pending'"
              [attr.aria-pressed]="s.id === 'pending' ? null : isActive(s.id)"
              [title]="sliceTitle(s)"
              (click)="toggle(s.id)"
              [attr.data-testid]="'overview-key-' + s.id"
            >
              <span class="dot" [class]="'k-' + s.id"></span>{{ s.label }} <b>{{ s.count }}</b>
            </button>
          }
        </span>
        <span class="group stats">
          <span class="stat" data-testid="overview-total"
            ><b>{{ scoped().length }}</b> {{ scoped().length === 1 ? 'request' : 'requests' }}</span
          >
          <span class="stat"
            ><b>{{ transferred() }}</b> received</span
          >
          @if (slowest(); as r) {
            <button
              class="stat link"
              (click)="store.selectRequest(r)"
              [title]="'Select the slowest request: ' + r.url"
              data-testid="overview-slowest"
            >
              slowest <b>{{ formatDuration(r) }}</b>
              <span class="mono name">{{ shortName(r.url) }}</span>
            </button>
          }
          <button
            class="stat link"
            [class.bad]="failed() > 0"
            [attr.aria-pressed]="store.failedOnly()"
            [disabled]="!failed() && !store.failedOnly()"
            (click)="store.failedOnly.set(!store.failedOnly())"
            title="Show only failed requests"
            data-testid="overview-failed"
          >
            <b>{{ failed() }}</b> failed
          </button>
          <button
            class="stat link"
            [class.warn]="wasteful() > 0"
            [attr.aria-pressed]="store.wasteOnly()"
            [disabled]="!wasteful() && !store.wasteOnly()"
            (click)="store.wasteOnly.set(!store.wasteOnly())"
            title="Show only duplicate or cancelled requests"
            data-testid="overview-waste"
          >
            <b>{{ wasteful() }}</b> wasteful
          </button>
        </span>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      padding: 5px 8px 4px;
      border-bottom: 1px solid var(--border);
    }
    :host:empty {
      display: none;
    }
    .bar {
      display: flex;
      gap: 2px;
      height: 6px;
      margin-bottom: 4px;
    }
    .slice {
      flex: 1 1 0;
      min-width: 4px;
      padding: 0;
      border: none;
      border-radius: 2px;
      transition:
        opacity 120ms ease-out,
        transform 120ms ease-out;
    }
    .slice:not(:disabled):hover {
      transform: scaleY(1.6);
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 2px 16px;
      flex-wrap: wrap;
      min-height: 18px;
      color: var(--muted);
    }
    .group {
      display: flex;
      align-items: center;
      gap: 2px 10px;
      flex-wrap: wrap;
    }
    button.key,
    button.stat {
      border: none;
      padding: 0 2px;
      border-radius: 3px;
      color: inherit;
      gap: 5px;
    }
    button:disabled {
      cursor: default;
    }
    button.key:disabled:hover,
    button.stat:disabled:hover {
      background: none;
    }
    button[aria-pressed='true'] {
      background: var(--selected);
      color: var(--fg);
    }
    button:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }
    b {
      color: var(--fg);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .dim {
      opacity: 0.3;
    }
    .stat {
      white-space: nowrap;
    }
    .name {
      max-width: 160px;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--fg);
    }
    .bad b {
      color: var(--error);
    }
    .warn b {
      color: var(--warn);
    }
    .k-2xx {
      background: var(--ok);
    }
    .k-3xx {
      background: var(--accent);
    }
    .k-4xx {
      background: var(--warn);
    }
    .k-5xx {
      background: var(--error);
    }
    .k-failed {
      background: repeating-linear-gradient(
        135deg,
        var(--error) 0 3px,
        color-mix(in srgb, var(--error) 45%, var(--bg)) 3px 6px
      );
    }
    .k-pending {
      background: repeating-linear-gradient(135deg, var(--muted) 0 3px, transparent 3px 6px);
    }
    @media (prefers-reduced-motion: reduce) {
      .slice {
        transition: none;
      }
    }
  `,
})
export class OverviewStrip {
  protected readonly store = inject(InspectorStore);
  protected readonly formatDuration = formatDuration;
  protected readonly shortName = shortName;

  protected readonly scoped = this.store.scopedRequests;

  protected readonly slices = computed<Slice[]>(() => {
    const counts = new Map<Segment, number>();
    for (const r of this.scoped()) {
      const id = isPending(r) ? 'pending' : statusOf(r);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return ORDER.filter((o) => counts.has(o.id)).map((o) => ({ ...o, count: counts.get(o.id)! }));
  });

  protected readonly transferred = computed(() =>
    formatBytes(this.scoped().reduce((sum, r) => sum + (responseSize(r) ?? 0), 0)),
  );

  protected readonly slowest = computed(() => {
    let best: CapturedRequest | null = null;
    for (const r of this.scoped()) if (duration(r) > (best ? duration(best) : -1)) best = r;
    return best;
  });

  protected readonly failed = computed(() => this.scoped().filter(isFailed).length);
  protected readonly wasteful = computed(() => {
    const waste = this.store.waste();
    return this.scoped().filter((r) => waste.has(r.id)).length;
  });

  protected isActive(id: Segment): boolean {
    return id !== 'pending' && this.store.statuses().includes(id);
  }

  /** Slices the status filter leaves out. Pending ones fall under "Failed" in the filter. */
  protected dimmed(id: Segment): boolean {
    const active = this.store.statuses();
    if (!active.length) return false;
    return !active.includes(id === 'pending' ? 'failed' : id);
  }

  protected toggle(id: Segment): void {
    if (id !== 'pending') this.store.toggleChip(this.store.statuses, id);
  }

  protected sliceTitle(s: Slice): string {
    const n = `${s.count} ${s.count === 1 ? 'request' : 'requests'}`;
    if (s.id === 'pending') return `${s.label}: ${n} still in flight`;
    return `${s.label}: ${n}. Click to ${this.isActive(s.id) ? 'remove from' : 'add to'} the status filter`;
  }
}
