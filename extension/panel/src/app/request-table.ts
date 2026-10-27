import { Component, computed, inject } from '@angular/core';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { formatBytes, formatDuration, formatTimestamp, ownerLabel, responseSize, shortName, statusClass, statusLabel, typeLabel } from './format';
import { isFailed, nextSort, sortRows, type CapturedRequest, type WasteSignal } from '@ngtrace/protocol';
import { ICONS } from './icons';
import { InspectorStore, type SortColumn } from './inspector.store';

const SORT_KEYS: Record<SortColumn, (r: CapturedRequest) => string | number | null> = {
  name: (r) => shortName(r.url),
  method: (r) => r.method,
  status: (r) => (r.error ? 0 : r.status),
  type: typeLabel,
  component: ownerLabel,
  size: responseSize,
  time: (r) => (r.endTime === null ? null : r.endTime - r.startTime),
  timestamp: (r) => r.startTime,
};

@Component({
  selector: 'app-request-table',
  imports: [HugeiconsIconComponent],
  template: `
    <table [class.striped]="store.stripedRows()">
      <thead>
        <tr>
          @for (c of columns; track c.key) {
            <th [class]="c.cls" [attr.aria-sort]="ariaSort(c.key)">
              <button class="sort" (click)="store.sort.set(nextSort(store.sort(), c.key))" [attr.data-testid]="'sort-' + c.key" [title]="'Sort by ' + c.label">
                {{ c.label }}
                @if (store.sort()?.key === c.key) {
                  <hugeicons-icon [icon]="store.sort()!.direction === 'asc' ? icons.sortAsc : icons.expanded" [size]="12" />
                }
              </button>
            </th>
          }
        </tr>
      </thead>
      <tbody>
        @for (r of rows(); track r.id) {
          <tr
            [class.selected]="store.selectedRequestId() === r.id"
            [class]="statusClass(r)"
            (click)="store.selectRequest(r)"
            data-testid="request-row"
          >
            <td class="name" [title]="r.url">
              @if (r.mocked) {
                <span class="mocked-badge" data-testid="mocked-badge" title="Answered by a Mock Rule, not the network">Mocked</span>
              }
              @if (r.replayOf) {
                <span class="replay-badge" data-testid="replay-badge" title="Re-sent from the panel">Replay</span>
              }
              @for (w of store.waste().get(r.id) ?? []; track w.kind) {
                <span class="waste" data-testid="waste-badge" [title]="wasteTitle(w.kind)">{{ wasteLabel(w) }}</span>
              }
              @if (isFailed(r)) {
                <span class="failed-badge" data-testid="failed-badge" title="Failed Request: network error or status 400 and above">{{ failedLabel(r) }}</span>
              }
              @if ((r.attempt ?? 1) > 1) {
                <span class="attempt-badge" data-testid="attempt-badge" title="Retry: sent again after the previous attempt failed">Attempt {{ r.attempt }}</span>
              }
              @if (recovered(r)) {
                <span class="recovered-badge" data-testid="recovered-badge" title="Succeeded after earlier attempts failed">Recovered</span>
              }
              <span class="url">{{ shortName(r.url) }}</span>
            </td>
            <td>{{ r.method }}</td>
            <td class="status">{{ statusLabel(r) }}</td>
            <td>{{ typeLabel(r) }}</td>
            <td class="owner" [class.weak]="r.attribution.confidence !== 'context'" [title]="r.attribution.callChain.join(' → ')">
              {{ ownerLabel(r) }}
            </td>
            <td class="num">{{ formatBytes(responseSize(r)) }}</td>
            <td class="num">{{ formatDuration(r) }}</td>
            <td class="num timestamp">{{ formatTimestamp(r) }}</td>
          </tr>
        } @empty {
          <tr class="empty">
            <td colspan="8">No requests{{ store.selectedNodeId() !== null ? ' for this selection' : '' }}.</td>
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    :host { display: block; overflow: auto; height: 100%; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th.name, td.name { width: 28%; }
    th.timestamp, td.timestamp { width: 96px; }
    td.timestamp { font-family: var(--mono); color: var(--muted); }
    th button.sort { border: none; padding: 0; width: 100%; justify-content: inherit; }
    th button.sort:hover { background: transparent; text-decoration: underline; }
    th.num button.sort { justify-content: flex-end; }
    th { position: sticky; top: 0; background: var(--toolbar); font-weight: normal; text-align: left; border-bottom: 1px solid var(--border); padding: 2px 6px; white-space: nowrap; }
    td { padding: 1px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-bottom: 1px solid var(--row-border); }
    td.name { font-family: var(--mono); }
    .num { text-align: right; }
    :where(table.striped tbody tr:nth-child(even)) td { background: var(--stripe); }
    tr:hover td { background: var(--hover); }
    tr.selected td { background: var(--selected); }
    tr.s-4xx td.status, tr.s-5xx td.status, tr.s-failed td { color: var(--error); }
    tr.pending td { color: var(--muted); }
    .waste { background: color-mix(in srgb, var(--warn) 28%, var(--bg)); color: var(--fg); border: 1px solid color-mix(in srgb, var(--warn) 60%, transparent); border-radius: 8px; padding: 0 6px; margin-right: 4px; font-size: 11px; }
    .mocked-badge { background: var(--tag); color: var(--bg); border-radius: 8px; padding: 0 6px; margin-right: 4px; font-size: 11px; }
    .failed-badge { background: color-mix(in srgb, var(--error) 22%, var(--bg)); color: var(--fg); border: 1px solid color-mix(in srgb, var(--error) 55%, transparent); border-radius: 8px; padding: 0 6px; margin-right: 4px; font-size: 11px; }
    .attempt-badge { background: var(--badge); border-radius: 8px; padding: 0 6px; margin-right: 4px; font-size: 11px; }
    .recovered-badge { background: color-mix(in srgb, var(--ok) 22%, var(--bg)); color: var(--fg); border: 1px solid color-mix(in srgb, var(--ok) 55%, transparent); border-radius: 8px; padding: 0 6px; margin-right: 4px; font-size: 11px; }
    .replay-badge { background: var(--badge); border-radius: 8px; padding: 0 6px; margin-right: 4px; font-size: 11px; }
    td.owner { color: var(--tag); font-family: var(--mono); }
    td.owner.weak { opacity: 0.8; }
    tr.empty td { color: var(--muted); text-align: center; padding: 16px; }
  `,
})
export class RequestTable {
  protected readonly store = inject(InspectorStore);
  protected readonly icons = ICONS;
  protected readonly nextSort = nextSort;
  protected readonly formatTimestamp = formatTimestamp;
  protected readonly columns: { key: SortColumn; label: string; cls: string }[] = [
    { key: 'name', label: 'Name', cls: 'name' },
    { key: 'method', label: 'Method', cls: '' },
    { key: 'status', label: 'Status', cls: '' },
    { key: 'type', label: 'Type', cls: '' },
    { key: 'component', label: 'Component', cls: '' },
    { key: 'size', label: 'Size', cls: 'num' },
    { key: 'time', label: 'Time', cls: 'num' },
    { key: 'timestamp', label: 'Timestamp', cls: 'num timestamp' },
  ];

  /** The visible requests in the chosen sort order (capture order when unsorted). */
  protected readonly rows = computed(() => {
    const sort = this.store.sort();
    const requests = this.store.visibleRequests();
    return sort ? sortRows(requests, SORT_KEYS[sort.key], sort.direction) : requests;
  });

  protected ariaSort(key: SortColumn): 'ascending' | 'descending' | 'none' {
    const sort = this.store.sort();
    return sort?.key !== key ? 'none' : sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  protected readonly shortName = shortName;
  protected readonly isFailed = isFailed;
  protected failedLabel(r: CapturedRequest): string {
    return r.error === null && r.status !== null ? `Failed ${r.status}` : 'Failed';
  }
  /** On the last attempt of a chain that ended in success. */
  protected recovered(r: CapturedRequest): boolean {
    const chain = this.store.retryChains().get(r.id);
    return !!chain?.recovered && chain.attempts[chain.attempts.length - 1].id === r.id;
  }
  protected wasteLabel(w: WasteSignal): string {
    return w.kind === 'duplicate' ? `Duplicate ×${w.count}` : 'Cancelled';
  }
  protected wasteTitle(kind: WasteSignal['kind']): string {
    return kind === 'duplicate'
      ? 'Same request sent again within the duplicate window'
      : 'Aborted, then the same request was sent again';
  }
  protected readonly statusLabel = statusLabel;
  protected readonly statusClass = statusClass;
  protected readonly typeLabel = typeLabel;
  protected readonly ownerLabel = ownerLabel;
  protected readonly formatBytes = formatBytes;
  protected readonly formatDuration = formatDuration;
  protected readonly responseSize = responseSize;
}
