import { Component, computed, inject } from '@angular/core';
import { ComponentDetails } from './component-details';
import { InspectorStore, UNATTRIBUTED } from './inspector.store';

@Component({
  selector: 'app-component-tree',
  imports: [ComponentDetails],
  template: `
    <div class="pane-title">
      Components
      <button
        class="icon"
        [class.active]="store.picking()"
        title="Select an element in the page to inspect its component"
        (click)="store.togglePick()"
        data-testid="picker"
      >
        ⌖
      </button>
    </div>
    <div class="tree" (mouseleave)="store.send({ type: 'highlight', id: null })">
      <div
        class="row all"
        [class.selected]="store.selectedNodeId() === null"
        (click)="store.selectNode(null)"
        data-testid="tree-all"
      >
        All requests <span class="badge">{{ store.requests().length }}</span>
      </div>
      @for (row of store.rows(); track row.node.id) {
        <div
          class="row"
          [class.selected]="store.selectedNodeId() === row.node.id"
          [class.owner]="ownerId() === row.node.id"
          [class.ghost]="row.node.destroyed"
          [style.padding-left.px]="8 + row.depth * 14"
          (click)="store.selectNode(row.node.id)"
          (mouseenter)="!row.node.destroyed && store.send({ type: 'highlight', id: row.node.id })"
          [attr.data-testid]="'node-' + row.node.name"
          [title]="row.node.destroyed ? 'Destroyed (Ghost Node)' : row.node.selector"
        >
          <span class="twisty" (click)="$event.stopPropagation(); store.toggleCollapsed(row.node.id)">
            {{ row.hasChildren ? (store.collapsed().has(row.node.id) ? '▸' : '▾') : '' }}
          </span>
          <span class="name">{{ row.node.name }}</span>
          @if (row.count) {
            <span class="badge" data-testid="badge">{{ row.count }}</span>
          }
        </div>
      } @empty {
        <div class="empty">No components found yet.</div>
      }
      <div
        class="row unattributed"
        [class.selected]="store.selectedNodeId() === unattributed"
        (click)="store.selectNode(unattributed)"
        data-testid="tree-unattributed"
      >
        ⟂ Unattributed <span class="badge">{{ store.unattributedCount() }}</span>
      </div>
    </div>
    @if (store.details() || store.selectedService()) {
      <app-component-details class="details" />
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 0; height: 100%; }
    .tree { flex: 1; overflow: auto; padding: 2px 0; }
    .row { display: flex; align-items: center; gap: 4px; padding: 1px 8px; cursor: default; white-space: nowrap; }
    .row:hover { background: var(--hover); }
    .row.selected { background: var(--selected); }
    .row.owner .name { text-decoration: underline; text-decoration-color: var(--accent); }
    .row.ghost { opacity: 0.45; font-style: italic; }
    .row.all, .row.unattributed { color: var(--muted); }
    .twisty { width: 10px; color: var(--muted); cursor: pointer; }
    .name { color: var(--tag); font-family: var(--mono); }
    .badge { margin-left: auto; background: var(--badge); color: var(--fg); border-radius: 8px; padding: 0 6px; font-size: 10px; }
    .empty { color: var(--muted); padding: 8px; }
    .details { border-top: 1px solid var(--border); flex: none; height: 50%; }
    .icon.active { color: var(--accent); }
  `,
})
export class ComponentTree {
  protected readonly store = inject(InspectorStore);
  protected readonly unattributed = UNATTRIBUTED;
  protected readonly ownerId = computed(() => this.store.selectedRequest()?.attribution.instanceId ?? null);
}
