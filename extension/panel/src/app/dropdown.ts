import { Component, input, signal } from '@angular/core';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { ICONS } from './icons';

/** A button that opens a menu of the projected content; picking an item or clicking elsewhere closes it. */
@Component({
  selector: 'app-dropdown',
  imports: [HugeiconsIconComponent],
  host: { '(document:click)': 'open.set(false)', '(document:keydown.escape)': 'open.set(false)' },
  template: `
    <button (click)="$event.stopPropagation(); toggle($any($event.currentTarget))" [title]="title()" [attr.data-testid]="testid()" aria-haspopup="menu" [attr.aria-expanded]="open()">
      <ng-content select="[label]" />
      <hugeicons-icon [icon]="icons.expanded" [size]="12" />
    </button>
    @if (open()) {
      <div class="menu" role="menu" [style.top.px]="anchor().top" [style.left.px]="anchor().left" [style.right.px]="anchor().right" (click)="open.set(false)">
        <ng-content />
      </div>
    }
  `,
  styles: `
    :host { position: relative; display: inline-flex; }
    /* Fixed, because the toolbar and the pane bodies clip overflow. */
    .menu { position: fixed; z-index: 10; margin: 2px 0 0; padding: 4px; display: flex; flex-direction: column; gap: 1px; background: var(--bg); border: 1px solid var(--border); box-shadow: 0 2px 6px rgb(0 0 0 / 20%); min-width: 190px; }
  `,
})
export class Dropdown {
  readonly title = input('');
  readonly testid = input<string | null>(null);
  /** Which edge of the button the menu lines up with. */
  readonly align = input<'left' | 'right'>('left');
  protected readonly icons = ICONS;
  protected readonly open = signal(false);
  protected readonly anchor = signal<{ top: number; left: number | null; right: number | null }>({ top: 0, left: null, right: null });

  protected toggle(button: HTMLElement): void {
    const r = button.getBoundingClientRect();
    this.anchor.set(
      this.align() === 'right'
        ? { top: r.bottom, left: null, right: document.documentElement.clientWidth - r.right }
        : { top: r.bottom, left: r.left, right: null },
    );
    this.open.update((o) => !o);
  }
}
