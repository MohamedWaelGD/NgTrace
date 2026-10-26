import { Component, computed, input, signal } from '@angular/core';

/** Collapsible JSON viewer for the Preview tab. */
@Component({
  selector: 'app-json-tree',
  template: `
    @if (isContainer()) {
      <span class="toggle" (click)="open.set(!open())">{{ open() ? '▾' : '▸' }}</span>
      @if (name() !== null) {
        <span class="key">{{ name() }}</span>:
      }
      <span class="summary">{{ summary() }}</span>
      @if (open()) {
        <div class="children">
          @for (entry of entries(); track entry[0]) {
            <div><app-json-tree [name]="entry[0]" [value]="entry[1]" [depth]="depth() + 1" /></div>
          }
        </div>
      }
    } @else {
      <span class="leaf">
        @if (name() !== null) {
          <span class="key">{{ name() }}</span>:
        }
        <span [class]="'v-' + kind()">{{ text() }}</span>
      </span>
    }
  `,
  styles: `
    :host { font-family: var(--mono); font-size: 12px; line-height: 18px; }
    .toggle { cursor: pointer; display: inline-block; width: 12px; color: var(--muted); }
    .children { padding-left: 14px; }
    .leaf { padding-left: 12px; }
    .key { color: var(--key); }
    .summary { color: var(--muted); }
    .v-string { color: var(--string); }
    .v-number, .v-boolean { color: var(--number); }
    .v-null { color: var(--muted); }
  `,
})
export class JsonTree {
  readonly name = input<string | null>(null);
  readonly value = input<unknown>();
  readonly depth = input(0);
  readonly open = signal(true);

  constructor() {
    queueMicrotask(() => this.open.set(this.depth() < 2));
  }

  readonly isContainer = computed(() => typeof this.value() === 'object' && this.value() !== null);
  readonly entries = computed(() => Object.entries(this.value() as object));
  readonly summary = computed(() => {
    const v = this.value();
    return Array.isArray(v) ? `Array(${v.length})` : `{${Object.keys(v as object).length} keys}`;
  });
  readonly kind = computed(() => (this.value() === null ? 'null' : typeof this.value()));
  readonly text = computed(() => (typeof this.value() === 'string' ? JSON.stringify(this.value()) : String(this.value())));
}
