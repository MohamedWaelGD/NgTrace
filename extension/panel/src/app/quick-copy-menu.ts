import { Component, computed, inject, signal } from '@angular/core';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { bearerToken, latestHeaderValue } from '@ngtrace/protocol';
import { copyText } from './clipboard';
import { ICONS } from './icons';
import { InspectorStore } from './inspector.store';

/** Toolbar menu: copy a Quick-copy Header from the most recent Captured Request that has it (ADR 6). */
@Component({
  selector: 'app-quick-copy-menu',
  imports: [HugeiconsIconComponent],
  host: { '(document:click)': 'open.set(false)' },
  template: `
    <button (click)="$event.stopPropagation(); toggle($any($event.currentTarget))" title="Copy a header from the latest request" data-testid="quick-copy-menu">
      <hugeicons-icon [icon]="icons.key" [size]="14" /> Copy header
    </button>
    @if (open()) {
      <ul class="menu" [style.top.px]="anchor().top" [style.right.px]="anchor().right" (click)="$event.stopPropagation()">
        @for (item of items(); track item.name) {
          <li>
            <button
              [disabled]="item.value === null"
              [title]="item.value === null ? 'No captured request has ' + item.name : 'Copy ' + item.name + ' from the latest request'"
              (click)="copy(item.value!, store.headerCopyLabel(item.name))"
              [attr.data-testid]="'quick-copy-latest-' + item.name.toLowerCase()"
            >
              {{ item.name }}
            </button>
            @if (item.token; as token) {
              <button (click)="copy(token, store.headerCopyLabel(item.name, item.name + ' token'))" title="Copy the token without the Bearer prefix">token only</button>
            }
          </li>
        } @empty {
          <li class="muted">No quick-copy headers configured (extension options).</li>
        }
      </ul>
    }
    @if (copied()) {
      <span class="copied">Copied {{ copied() }}</span>
    }
  `,
  styles: `
    :host { position: relative; display: inline-flex; align-items: center; gap: 6px; }
    .menu { position: fixed; z-index: 10; margin: 2px 0 0; padding: 4px; list-style: none; background: var(--bg); border: 1px solid var(--border); box-shadow: 0 2px 6px rgb(0 0 0 / 20%); min-width: 180px; }
    .menu li { display: flex; gap: 4px; padding: 1px 0; }
    .menu li button:first-child { flex: 1; justify-content: flex-start; }
    button:disabled { color: var(--muted); cursor: default; }
    .muted { color: var(--muted); white-space: normal; }
    .copied { color: var(--accent); }
  `,
})
export class QuickCopyMenu {
  protected readonly store = inject(InspectorStore);
  protected readonly icons = ICONS;
  protected readonly open = signal(false);
  protected readonly copied = signal<string | null>(null);
  /** The toolbar clips overflow, so the menu is fixed-positioned under its button. */
  protected readonly anchor = signal({ top: 0, right: 0 });

  protected readonly items = computed(() =>
    this.store.quickCopyHeaders().map((name) => {
      const value = latestHeaderValue(this.store.requests(), name);
      return { name, value, token: value === null ? null : bearerToken(value) };
    }),
  );

  protected toggle(button: HTMLElement): void {
    const r = button.getBoundingClientRect();
    this.anchor.set({ top: r.bottom, right: document.documentElement.clientWidth - r.right });
    this.open.update((o) => !o);
  }

  protected async copy(text: string, what: string): Promise<void> {
    await copyText(text);
    this.open.set(false);
    this.copied.set(what);
    setTimeout(() => this.copied.set(null), 1500);
  }
}
