import { Component, computed, inject, input } from '@angular/core';
import type { ValueEntry, ValueTarget } from '@ngapi/protocol';
import { Twisty } from './icons';
import { InspectorStore, targetKey } from './inspector.store';

/** Read-only, lazily expanded property explorer for component and service state. */
@Component({
  selector: 'app-value-tree',
  imports: [Twisty],
  template: `
    @for (entry of entries(); track entry.name) {
      @let childPath = [...path(), entry.name];
      @let open = isOpen(childPath);
      <div class="row" [class.flash]="flashing(childPath)" [style.padding-left.px]="path().length * 12">
        <app-twisty [open]="open" [expandable]="entry.expandable" (click)="toggle(entry, childPath, open)" />
        <span class="key">{{ entry.name }}</span>: <span class="val" [title]="entry.preview">{{ entry.preview }}</span>
      </div>
      @if (open) {
        <app-value-tree [target]="target()" [path]="childPath" [entries]="children(childPath)" />
      }
    } @empty {
      @if (!path().length) {
        <div class="muted">No properties.</div>
      }
    }
  `,
  styles: `
    :host { display: block; font-family: var(--mono); }
    .row { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 8px; }
    .key { color: var(--key); }
    .muted { color: var(--muted); font-family: system-ui, sans-serif; padding: 2px 8px; }
  `,
})
export class ValueTree {
  private readonly store = inject(InspectorStore);
  readonly target = input.required<ValueTarget>();
  readonly path = input<string[]>([]);
  readonly entries = input.required<ValueEntry[]>();

  private readonly expansions = computed(() => this.store.expansions());

  protected flashing(path: string[]): boolean {
    return this.store.flashing().has(targetKey(this.target(), path));
  }

  protected isOpen(path: string[]): boolean {
    return this.expansions().has(targetKey(this.target(), path));
  }

  protected children(path: string[]): ValueEntry[] {
    return this.expansions().get(targetKey(this.target(), path)) ?? [];
  }

  protected toggle(entry: ValueEntry, path: string[], open: boolean): void {
    if (!entry.expandable) return;
    if (open) this.store.collapse(this.target(), path);
    else this.store.expand(this.target(), path);
  }
}
