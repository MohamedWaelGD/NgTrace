import { Component, computed, inject } from '@angular/core';
import type { CapturedRequest } from '@ngtrace/protocol';
import { shortName } from './format';
import { InspectorStore } from './inspector.store';

/** Value History scrubber: steps through the target's past values, with its requests as markers. */
@Component({
  selector: 'app-history-scrubber',
  template: `
    @if (store.historyTimes().length > 1 || markers().length) {
      <div class="scrubber">
        <div class="track">
          @for (m of markers(); track m.request.id) {
            <button
              class="marker"
              [style.left.%]="m.left"
              [title]="m.request.method + ' ' + shortName(m.request.url) + ': values just before it was sent'"
              (click)="jumpTo(m.request)"
              data-testid="history-marker"
            ></button>
          }
          <input
            type="range"
            min="0"
            [max]="store.historyTimes().length - 1"
            [value]="store.historyIndex() ?? store.historyTimes().length - 1"
            (input)="store.viewHistory(+$any($event.target).value)"
            aria-label="Value History"
            data-testid="history-scrubber"
          />
        </div>
      </div>
    }
    @let index = store.historyIndex();
    @if (index !== null) {
      <div class="bar" data-testid="history-bar">
        Viewing history · step {{ index + 1 }} of {{ store.historyTimes().length }}
        <button (click)="store.viewHistory(null)" data-testid="history-back">Back to live</button>
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .scrubber { padding: 2px 8px 0; }
    .track { position: relative; padding-top: 8px; }
    input[type='range'] { width: 100%; margin: 0; }
    .marker { position: absolute; top: 0; width: 7px; height: 8px; margin-left: -3px; padding: 0; border: none; border-radius: 0; background: var(--accent); clip-path: polygon(50% 100%, 0 0, 100% 0); cursor: pointer; }
    .bar { display: flex; align-items: center; gap: 8px; padding: 2px 8px; background: var(--notice); }
    .bar button { margin-left: auto; }
  `,
})
export class HistoryScrubber {
  protected readonly store = inject(InspectorStore);
  protected readonly shortName = shortName;

  /** Markers placed on the snapshot steps' axis: a request sits after the last snapshot taken before it. */
  protected readonly markers = computed(() => {
    const times = this.store.historyTimes();
    const steps = Math.max(1, times.length - 1);
    return this.store.historyMarkers().map((request) => {
      const before = times.filter((t) => t < request.startMono!).length - 1;
      const next = times[before + 1];
      const prev = times[before];
      // Between the step before and the one after, by time.
      const fraction = prev !== undefined && next !== undefined && next > prev ? (request.startMono! - prev) / (next - prev) : 0;
      const position = Math.min(steps, Math.max(0, before + fraction));
      return { request, left: (position / steps) * 100 };
    });
  });

  protected jumpTo(r: CapturedRequest): void {
    this.store.selectRequest(r);
  }
}
