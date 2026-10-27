import { Component, effect, inject, input, signal } from '@angular/core';
import { expiredAtSend, expiryLabel, expiryState, MASK, type CapturedRequest, type Token } from '@ngtrace/protocol';
import { InspectorStore } from './inspector.store';

/** Tokens tab: every Token in the request, decoded, with a live `exp` countdown. Masked headers and cookies stay hidden until revealed. */
@Component({
  selector: 'app-request-tokens',
  template: `
    <div class="muted">Decoded only: the signature is not verified.</div>
    @for (t of tokens(); track $index) {
      <section class="token" data-testid="token">
        <div class="head">
          <span class="mono tag" data-testid="token-location">{{ t.location }}</span>
          <span class="muted">{{ t.side }}</span>
          @if (!hidden(t, $index)) {
            <span [class]="'exp-' + expiry(t).status" data-testid="token-expiry">{{ expiryText(t) }}</span>
            @if (sentExpired(t)) {
              <span class="exp-expired" data-testid="token-expired-at-send">already expired when sent</span>
            }
          }
        </div>
        @if (hidden(t, $index)) {
          <div class="mono masked" data-testid="token-hidden" (click)="reveal($index)">{{ mask }}  (click to reveal)</div>
        } @else {
          <details open>
            <summary>Header</summary>
            @for (e of rows(t.header); track e[0]) {
              <div class="kv"><span>{{ e[0] }}</span><span class="mono">{{ e[1] }}</span></div>
            }
          </details>
          <details open>
            <summary>Claims</summary>
            @for (e of rows(t.claims); track e[0]) {
              <div class="kv" data-testid="token-claim"><span>{{ e[0] }}</span><span class="mono">{{ e[1] }}</span></div>
            }
          </details>
        }
      </section>
    } @empty {
      <div class="muted" data-testid="no-tokens">No Token found in this request.</div>
    }
  `,
  styles: `
    .token { border-top: 1px solid var(--border); padding: 6px 0; }
    .head { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
    .tag { color: var(--tag); }
    .muted { color: var(--muted); }
    .masked { cursor: pointer; }
    details { margin: 4px 0; }
    summary { cursor: pointer; font-weight: 600; padding: 2px 0; user-select: none; }
    .kv { display: grid; grid-template-columns: minmax(120px, 30%) 1fr; gap: 8px; padding: 1px 0; }
    .kv > span:first-child { color: var(--muted); }
    .kv > span:last-child { word-break: break-all; }
    .exp-valid { color: var(--ok); }
    .exp-expiring { color: var(--warn); font-weight: 600; }
    .exp-expired { color: var(--error); }
  `,
})
export class RequestTokens {
  readonly request = input.required<CapturedRequest>();
  readonly tokens = input.required<Token[]>();
  readonly unmasked = input(false);
  private readonly store = inject(InspectorStore);
  protected readonly mask = MASK;
  private readonly revealed = signal<ReadonlySet<number>>(new Set());
  /** Ticks once a second while the tab is open, to drive the countdown. */
  private readonly now = signal(Date.now());

  constructor() {
    effect((onCleanup) => {
      const id = setInterval(() => this.now.set(Date.now()), 1000);
      onCleanup(() => clearInterval(id));
    });
  }

  /** A Token in a masked header or cookie stays hidden until Unmasked or revealed; query and body Tokens are never masked. */
  protected hidden(t: Token, index: number): boolean {
    return t.headerName !== null && !this.unmasked() && !this.revealed().has(index) && this.store.masker().isMasked(t.headerName);
  }

  protected reveal(index: number): void {
    this.revealed.update((s) => new Set(s).add(index));
  }

  protected expiry(t: Token) {
    return expiryState(t, this.now());
  }

  protected expiryText(t: Token): string {
    return expiryLabel(this.expiry(t));
  }

  protected sentExpired(t: Token): boolean {
    return expiredAtSend(t, this.request());
  }

  /** Header or claims as rows; time claims (`exp`, `iat`, `nbf`) also show their date. */
  protected rows(values: Record<string, unknown>): [string, string][] {
    return Object.entries(values).map(([k, v]) => {
      const text = typeof v === 'string' ? v : JSON.stringify(v);
      const isTime = ['exp', 'iat', 'nbf'].includes(k) && typeof v === 'number';
      return [k, isTime ? `${text}  (${new Date((v as number) * 1000).toISOString()})` : text];
    });
  }
}
