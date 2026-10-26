import { afterNextRender, Component, computed, effect, ElementRef, inject, Injector, signal, untracked } from '@angular/core';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { ComponentDetails } from './component-details';
import { ICONS, Twisty } from './icons';
import { clamp, PANE_MIN, PaneLayout, Splitter } from './layout';
import { InspectorStore, UNATTRIBUTED } from './inspector.store';
import { SourceActions } from './source-actions';
import type { TreeNode } from '@ngapi/protocol';

@Component({
  selector: 'app-component-tree',
  imports: [ComponentDetails, HugeiconsIconComponent, Twisty, Splitter, SourceActions],
  host: { '(document:click)': 'menu.set(null)', '(document:keydown.escape)': 'menu.set(null)' },
  template: `
    <div class="pane-title">
      Components
      <button
        class="icon"
        [class.active]="store.picking()"
        title="Select an element in the page to inspect its component"
        (click)="store.togglePick()"
        data-testid="picker"
        aria-label="Pick element"
      >
        <hugeicons-icon [icon]="icons.picker" [size]="14" />
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
          [class.flash]="flashId() === row.node.id"
          [style.padding-left.px]="8 + row.depth * 14"
          (click)="store.selectNode(row.node.id)"
          (contextmenu)="openMenu($event, row.node)"
          (mouseenter)="!row.node.destroyed && store.send({ type: 'highlight', id: row.node.id })"
          [attr.data-testid]="'node-' + row.node.name"
          [title]="row.node.destroyed ? 'Destroyed (Ghost Node)' : row.node.selector"
        >
          <app-twisty
            [open]="!store.collapsed().has(row.node.id)"
            [expandable]="row.hasChildren"
            (click)="$event.stopPropagation(); store.toggleCollapsed(row.node.id)"
          />
          <span class="name">{{ row.node.name }}</span>
          @if (store.pickedElement()?.id === row.node.id) {
            <span class="picked mono" data-testid="picked-from">from {{ store.pickedElement()!.element }}</span>
          }
          @if (row.failed) {
            <span class="badge fail" data-testid="failed-count" [title]="row.failed + ' failed request(s)'">{{ row.failed }} failed</span>
          }
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
        <hugeicons-icon [icon]="icons.unattributed" [size]="14" /> Unattributed <span class="badge">{{ store.unattributedCount() }}</span>
      </div>
    </div>
    @if (menu(); as m) {
      <div class="menu" role="menu" [style.top.px]="m.y" [style.left.px]="m.x" (click)="$event.stopPropagation()" data-testid="tree-menu">
        <div class="menu-title mono">{{ m.node.name }}</div>
        <app-source-actions class="menu-actions" [node]="m.node" />
      </div>
    }
    @if (store.details() || store.selectedService()) {
      <div
        appSplitter
        class="horizontal"
        (dragStart)="startResize()"
        (drag)="resize($event.dy)"
        (reset)="layout.set('details', null)"
        data-testid="splitter-details"
      ></div>
      <app-component-details
        class="details"
        [style.height]="layout.sizes().details === null ? '50%' : layout.sizes().details + 'px'"
      />
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 0; height: 100%; }
    .tree { flex: 1; overflow: auto; padding: 2px 0; min-height: 60px; }
    .row { display: flex; align-items: center; gap: 4px; padding: 1px 8px; cursor: default; white-space: nowrap; }
    .row:hover { background: var(--hover); }
    .row.selected { background: var(--selected); }
    .row.owner .name { text-decoration: underline; text-decoration-color: var(--accent); }
    .row.ghost { opacity: 0.45; font-style: italic; }
    .row.all, .row.unattributed { color: var(--muted); }
    .name { color: var(--tag); font-family: var(--mono); }
    .picked { color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; }
    .badge { margin-left: auto; background: var(--badge); color: var(--fg); border-radius: 8px; padding: 0 6px; font-size: 10px; }
    .badge.fail { background: color-mix(in srgb, var(--error) 22%, var(--bg)); }
    .badge.fail + .badge { margin-left: 0; }
    .empty { color: var(--muted); padding: 8px; }
    .details { flex: none; min-height: 80px; max-height: calc(100% - 90px); }
    .splitter.horizontal { width: auto; height: 4px; padding: 1px 0; cursor: row-resize; flex: none; }
    .icon.active { color: var(--accent); }
    .menu { position: fixed; z-index: 10; padding: 4px; background: var(--bg); border: 1px solid var(--border); box-shadow: 0 2px 6px rgb(0 0 0 / 20%); min-width: 160px; }
    .menu-title { color: var(--tag); padding: 0 2px 4px; }
    .menu-actions { flex-direction: column; align-items: stretch; }
  `,
})
export class ComponentTree {
  protected readonly store = inject(InspectorStore);
  protected readonly icons = ICONS;
  protected readonly layout = inject(PaneLayout);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private dragFrom = { details: 0, host: 0 };
  private readonly injector = inject(Injector);
  protected readonly flashId = signal<number | null>(null);

  /** Picked node whose details have not arrived yet: the Details pane will shrink the tree then. */
  private revealPending: number | null = null;

  constructor() {
    // The picker selected a component: scroll its row into view (only when hidden) and flash it.
    effect(() => {
      if (!this.store.revealSelected()) return;
      const id = untracked(this.store.selectedNodeId);
      this.revealPending = id;
      afterNextRender(() => this.reveal(id, true), { injector: this.injector });
    });
    effect(() => {
      const details = this.store.details();
      if (details === null || details.id !== this.revealPending) return;
      this.revealPending = null;
      afterNextRender(() => this.reveal(details.id, false), { injector: this.injector });
    });
  }

  private reveal(id: number | null, flash: boolean): void {
    const row = this.host.nativeElement.querySelector<HTMLElement>('.row.selected');
    const tree = row?.closest<HTMLElement>('.tree');
    if (!row || !tree) return;
    const r = row.getBoundingClientRect();
    const t = tree.getBoundingClientRect();
    if (r.top < t.top || r.bottom > t.bottom) {
      tree.scrollTop += r.top - t.top - (tree.clientHeight - r.height) / 2;
    }
    if (!flash) return;
    this.flashId.set(id);
    setTimeout(() => this.flashId.set(null), 600);
  }

  /** Context menu of a tree node: Reveal in Elements, Open in Sources / editor. */
  protected readonly menu = signal<{ node: TreeNode; x: number; y: number } | null>(null);

  protected openMenu(event: MouseEvent, node: TreeNode): void {
    event.preventDefault();
    this.menu.set({ node, x: event.clientX, y: event.clientY });
  }

  protected readonly unattributed = UNATTRIBUTED;
  protected readonly ownerId = computed(() => this.store.selectedRequest()?.attribution.instanceId ?? null);

  protected startResize(): void {
    const host = this.host.nativeElement;
    const details = host.querySelector('app-component-details')?.getBoundingClientRect().height ?? 0;
    this.dragFrom = { details, host: host.clientHeight };
  }

  protected resize(dy: number): void {
    const { details, host } = this.dragFrom;
    this.layout.set('details', clamp(details - dy, PANE_MIN.details, host - PANE_MIN.componentTree - 30));
  }
}
