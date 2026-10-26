import { Component, inject } from '@angular/core';
import { formatBytes, formatDuration, ownerLabel, responseSize, shortName, statusClass, statusLabel, typeLabel } from './format';
import { type WasteSignal } from '@ngapi/protocol';
import { InspectorStore } from './inspector.store';

@Component({
  selector: 'app-request-table',
  template: `
    <table>
      <thead>
        <tr>
          <th class="name">Name</th>
          <th>Method</th>
          <th>Status</th>
          <th>Type</th>
          <th>Component</th>
          <th class="num">Size</th>
          <th class="num">Time</th>
        </tr>
      </thead>
      <tbody>
        @for (r of store.visibleRequests(); track r.id) {
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
              <span>{{ shortName(r.url) }}</span>
            </td>
            <td>{{ r.method }}</td>
            <td class="status">{{ statusLabel(r) }}</td>
            <td>{{ typeLabel(r) }}</td>
            <td class="owner" [class.weak]="r.attribution.confidence !== 'context'" [title]="r.attribution.callChain.join(' → ')">
              {{ ownerLabel(r) }}
            </td>
            <td class="num">{{ formatBytes(responseSize(r)) }}</td>
            <td class="num">{{ formatDuration(r) }}</td>
          </tr>
        } @empty {
          <tr class="empty">
            <td colspan="7">No requests{{ store.selectedNodeId() !== null ? ' for this selection' : '' }}.</td>
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    :host { display: block; overflow: auto; height: 100%; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { position: sticky; top: 0; background: var(--toolbar); font-weight: normal; text-align: left; border-bottom: 1px solid var(--border); padding: 2px 6px; white-space: nowrap; }
    td { padding: 1px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-bottom: 1px solid var(--row-border); }
    th.name, td.name { width: 30%; }
    td.name { font-family: var(--mono); }
    .num { text-align: right; }
    tr:hover td { background: var(--hover); }
    tr.selected td { background: var(--selected); }
    tr.s-4xx td.status, tr.s-5xx td.status, tr.s-failed td { color: var(--error); }
    tr.pending td { color: var(--muted); }
    .waste { background: var(--warn-bg, #fff3cd); color: var(--warn, #7a5c00); border-radius: 8px; padding: 0 6px; margin-right: 4px; font-size: 11px; }
    .mocked-badge { background: var(--tag); color: var(--bg); border-radius: 8px; padding: 0 6px; margin-right: 4px; font-size: 11px; }
    .replay-badge { background: var(--badge); border-radius: 8px; padding: 0 6px; margin-right: 4px; font-size: 11px; }
    td.owner { color: var(--tag); font-family: var(--mono); }
    td.owner.weak { opacity: 0.8; }
    tr.empty td { color: var(--muted); text-align: center; padding: 16px; }
  `,
})
export class RequestTable {
  protected readonly store = inject(InspectorStore);
  protected readonly shortName = shortName;
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
