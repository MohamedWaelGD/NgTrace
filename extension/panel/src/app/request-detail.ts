import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { bearerToken, bodyText, expiredAtSend, expiryLabel, expiryState, findTokens, headerValue, isEmptyDiff, MASK, toCurl, toCypressStub, toFetch, toPlaywrightStub, type Body, type Header, type Token } from '@ngtrace/protocol';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { copyText } from './clipboard';
import { ICONS } from './icons';
import { formatBytes, formatDuration, formatTimestamp, statusLabel, typeLabel } from './format';
import { InspectorStore } from './inspector.store';
import { Dropdown } from './dropdown';
import { JsonTree } from './json-tree';
import { RequestContract } from './request-contract';
import { RequestReplay } from './request-replay';
import { SourceActions } from './source-actions';

type Tab = 'headers' | 'payload' | 'response' | 'preview' | 'timing' | 'initiator' | 'interceptors' | 'tokens' | 'contract' | 'replay';

@Component({
  selector: 'app-request-detail',
  imports: [JsonTree, NgTemplateOutlet, HugeiconsIconComponent, RequestContract, RequestReplay, SourceActions, Dropdown],
  template: `
    @if (store.selectedRequest(); as r) {
      <div class="tabs">
        <button class="close" title="Close" aria-label="Close" (click)="store.selectRequest(null)"><hugeicons-icon [icon]="icons.close" [size]="14" /></button>
        @for (t of tabs; track t.id) {
          <button
            [class.active]="tab() === t.id"
            [disabled]="(t.id === 'interceptors' && !devBuild()) || (t.id === 'tokens' && !tokens().length)"
            [title]="t.id === 'interceptors' && !devBuild() ? 'Needs a development build' : t.id === 'tokens' && !tokens().length ? 'No JWT found in this request' : ''"
            (click)="tab.set(t.id)"
            [attr.data-testid]="'tab-' + t.id"
          >
            {{ t.label }}
            @if (t.id === 'tokens' && tokens().length) {
              <span class="count" data-testid="tokens-count">{{ tokens().length }}</span>
            }
          </button>
        }
      </div>
      <div class="actions">
        <label class="unmasked"><input type="checkbox" [checked]="unmasked()" (change)="unmasked.set(!unmasked())" /> Unmasked</label>
        <button (click)="store.mockFrom(r)" data-testid="mock-this" title="Create a Mock Rule from this request">Mock this request…</button>
        <app-dropdown title="Copy part of this request" testid="copy-menu">
          <span label class="label"><hugeicons-icon [icon]="icons.copy" [size]="14" /> Copy</span>
          <button (click)="copy(r.url, 'URL')" title="Copy URL"><hugeicons-icon [icon]="icons.url" [size]="14" /> URL</button>
          <button (click)="copy(curl(), 'cURL')" data-testid="copy-curl" title="Copy as cURL"><hugeicons-icon [icon]="icons.curl" [size]="14" /> cURL</button>
          <button (click)="copy(fetchCode(), 'fetch')" data-testid="copy-fetch" title="Copy as fetch"><hugeicons-icon [icon]="icons.fetch" [size]="14" /> fetch</button>
          <button (click)="copy(playwrightStub(), 'Playwright stub')" data-testid="copy-playwright" title="Copy a Playwright route stubbing this response"><hugeicons-icon [icon]="icons.fetch" [size]="14" /> Playwright stub</button>
          <button (click)="copy(cypressStub(), 'Cypress stub')" data-testid="copy-cypress" title="Copy a Cypress intercept stubbing this response"><hugeicons-icon [icon]="icons.fetch" [size]="14" /> Cypress stub</button>
          <button (click)="copy(responseText() ?? '', 'response')" title="Copy response"><hugeicons-icon [icon]="icons.response" [size]="14" /> Response</button>
          @for (q of quickCopies(); track q.name) {
            <button
              (click)="copyHeader([q.name, q.value])"
              [title]="'Copy the ' + q.name + ' header (raw value)'"
              [attr.data-testid]="'quick-copy-' + q.name.toLowerCase()"
            >
              <hugeicons-icon [icon]="icons.key" [size]="14" /> {{ q.name }}
            </button>
            @if (q.token; as token) {
              <button (click)="copy(token, store.headerCopyLabel(q.name, q.name + ' token'))" [attr.data-testid]="'quick-copy-token-' + q.name.toLowerCase()" title="Copy the token without the Bearer prefix">
                <hugeicons-icon [icon]="icons.key" [size]="14" /> {{ q.name }} token only
              </button>
            }
          }
        </app-dropdown>
        @if (copied()) {
          <span class="copied">Copied {{ copied() }}</span>
        }
      </div>
      <div class="body" data-testid="detail">
        @switch (tab()) {
          @case ('headers') {
            @if (r.mocked) {
              <div class="muted" data-testid="mocked-note">Answered by a Mock Rule: this request never reached the network, so there is no wire data.</div>
            }
            @if (r.shortCircuitedBy) {
              <div class="muted" data-testid="short-circuit-note">Answered by the interceptor <span class="mono">{{ r.shortCircuitedBy }}</span>: this request never reached the network.</div>
            }
            <details open>
              <summary>General</summary>
              <div class="kv"><span>Request URL</span><span class="mono">{{ r.url }}</span></div>
              <div class="kv"><span>Request Method</span><span>{{ r.method }}</span></div>
              <div class="kv"><span>Status Code</span><span>{{ statusLabel(r) }} {{ r.statusText }}</span></div>
              @if (r.error) {
                <div class="kv"><span>Error</span><span class="error">{{ r.error }}</span></div>
              }
              <div class="kv"><span>Type</span><span>{{ typeLabel(r) }}</span></div>
              @if (store.retryChains().get(r.id); as chain) {
                <div class="kv" data-testid="retry-chain">
                  <span>Retry chain</span>
                  <span>
                    @for (a of chain.attempts; track a.id) {
                      <a href="" [class.current]="a.id === r.id" (click)="$event.preventDefault(); store.selectRequest(a)" data-testid="retry-attempt">Attempt {{ a.attempt ?? $index + 1 }} ({{ statusLabel(a) }})</a>
                      @if (!$last) {
                        →
                      }
                    }
                    @if (chain.recovered) {
                      <span class="ok"> · recovered</span>
                    }
                  </span>
                </div>
              }
            </details>
            <details open>
              <summary>Response Headers ({{ r.responseHeaders.length }})</summary>
              @for (h of r.responseHeaders; track $index) {
                <div class="kv">
                  <span class="header-name">
                    {{ h[0] }}
                    <button class="icon copy-header" (click)="copyHeader(h)" [title]="'Copy ' + h[0] + ' value'" [attr.aria-label]="'Copy ' + h[0] + ' value'" [attr.data-testid]="'copy-header-res-' + h[0].toLowerCase()">
                      <hugeicons-icon [icon]="icons.copy" [size]="12" />
                    </button>
                  </span>
                  <span class="mono" [class.masked]="isMasked(h, r.id + ':res' + $index)" (click)="reveal(r.id + ':res' + $index)">{{ shown(h, r.id + ':res' + $index) }}</span></div>
              }
            </details>
            <details open>
              <summary>Request Headers ({{ r.enrichment ? 'browser' : 'app-level only' }})</summary>
              @for (h of requestHeaders(); track $index) {
                <div class="kv">
                  <span class="header-name">
                    {{ h[0] }}
                    <button class="icon copy-header" (click)="copyHeader(h)" [title]="'Copy ' + h[0] + ' value'" [attr.aria-label]="'Copy ' + h[0] + ' value'" [attr.data-testid]="'copy-header-req-' + h[0].toLowerCase()">
                      <hugeicons-icon [icon]="icons.copy" [size]="12" />
                    </button>
                  </span>
                  <span class="mono" [class.masked]="isMasked(h, r.id + ':req' + $index)" (click)="reveal(r.id + ':req' + $index)">{{ shown(h, r.id + ':req' + $index) }}</span></div>
              } @empty {
                <div class="muted">No request headers set by the app.</div>
              }
            </details>
          }
          @case ('payload') {
            @if (query().length) {
              <details open>
                <summary>Query String Parameters</summary>
                @for (q of query(); track $index) {
                  <div class="kv"><span>{{ q[0] }}</span><span class="mono">{{ q[1] }}</span></div>
                }
              </details>
            }
            <details open>
              <summary>Request Payload</summary>
              <ng-container *ngTemplateOutlet="bodyView; context: { $implicit: r.requestBody }" />
            </details>
          }
          @case ('response') {
            @if (responseText(); as text) {
              <pre class="mono">{{ text }}</pre>
              @if (truncated(r.responseBody)) {
                <div class="muted">Truncated at 1 MB.</div>
              }
            } @else {
              <ng-container *ngTemplateOutlet="bodyView; context: { $implicit: r.responseBody }" />
            }
          }
          @case ('preview') {
            @if (previewJson(); as json) {
              <app-json-tree [value]="json.value" />
            } @else {
              <ng-container *ngTemplateOutlet="bodyView; context: { $implicit: r.responseBody }" />
            }
          }
          @case ('timing') {
            <div class="kv"><span>Started</span><span>{{ started() }}</span></div>
            <div class="kv"><span>Duration</span><span>{{ formatDuration(r) }}</span></div>
            @if (r.enrichment?.serverTiming !== undefined) {
              <div class="kv"><span>Network (DevTools)</span><span>{{ r.enrichment!.serverTiming!.toFixed(1) }} ms</span></div>
            }
          }
          @case ('interceptors') {
            @if (r.interceptorSteps?.length) {
              <ol class="steps" data-testid="interceptor-steps">
                @for (s of r.interceptorSteps; track $index) {
                  <li data-testid="interceptor-step">
                    <div class="step-head">
                      <span class="mono tag" data-testid="interceptor-name">{{ s.name }}</span>
                      @if (s.kind === 'class') {
                        <span class="muted">class (inside the legacy step)</span>
                      }
                      @if (s.shortCircuit) {
                        <span class="sc" data-testid="short-circuit" title="Returned without calling next: nothing was sent">short-circuit</span>
                      }
                      @if (s.retries) {
                        <span data-testid="interceptor-retries">
                          {{ s.retries }} {{ s.retries === 1 ? 'retry' : 'retries' }}:
                          @for (a of attemptsOf(r.id); track a.id) {
                            <a href="" (click)="$event.preventDefault(); store.selectRequest(a)">#{{ a.attempt ?? $index + 1 }}</a>
                          }
                        </span>
                      }
                    </div>
                    @if (s.diff; as diff) {
                      @if (isEmptyDiff(diff)) {
                        <div class="muted">Passed the request on unchanged.</div>
                      } @else {
                        @for (h of diff.added; track $index) {
                          <div class="mono add" data-testid="diff-added">+ {{ h[0] }}: {{ headerShown(h[0], h[1]) }}</div>
                        }
                        @for (h of diff.removed; track $index) {
                          <div class="mono del">− {{ h[0] }}: {{ headerShown(h[0], h[1]) }}</div>
                        }
                        @for (c of diff.changed; track $index) {
                          <div class="mono chg">~ {{ c.name }}: {{ headerShown(c.name, c.before) }} → {{ headerShown(c.name, c.after) }}</div>
                        }
                        @for (f of diff.fields; track f.field) {
                          <div class="mono chg">~ {{ f.field }}: {{ f.before || '∅' }} → {{ f.after || '∅' }}</div>
                        }
                      }
                    } @else if (!s.shortCircuit) {
                      <div class="muted">Has not called next yet.</div>
                    }
                  </li>
                }
              </ol>
            } @else {
              <div class="muted">No Interceptor Steps were recorded for this request (it did not go through HttpClient, or was sent before the hook found it).</div>
            }
          }
          @case ('tokens') {
            <div class="muted">Decoded only: the signature is not verified.</div>
            @for (t of tokens(); track $index) {
              <section class="token" data-testid="token">
                <div class="step-head">
                  <span class="mono tag" data-testid="token-location">{{ t.location }}</span>
                  <span class="muted">{{ t.side }}</span>
                  @if (!tokenHidden(t, $index)) {
                    <span [class]="'exp exp-' + expiry(t).status" data-testid="token-expiry">{{ expiryText(t) }}</span>
                    @if (sentExpired(t)) {
                      <span class="exp exp-expired" data-testid="token-expired-at-send">already expired when sent</span>
                    }
                  }
                </div>
                @if (tokenHidden(t, $index)) {
                  <div class="mono masked" data-testid="token-hidden" (click)="reveal(tokenKey($index))">{{ maskText }}  (click to reveal)</div>
                } @else {
                  <details open>
                    <summary>Header</summary>
                    @for (e of entries(t.header); track e[0]) {
                      <div class="kv"><span>{{ e[0] }}</span><span class="mono">{{ e[1] }}</span></div>
                    }
                  </details>
                  <details open>
                    <summary>Claims</summary>
                    @for (e of entries(t.claims); track e[0]) {
                      <div class="kv" data-testid="token-claim"><span>{{ e[0] }}</span><span class="mono">{{ e[1] }}</span></div>
                    }
                  </details>
                }
              </section>
            }
          }
          @case ('contract') {
            <app-request-contract [request]="r" (copyTypescript)="copy($event, 'TypeScript')" />
          }
          @case ('replay') {
            <app-request-replay [request]="r" />
          }
          @case ('initiator') {
            <section data-testid="initiator">
              <div class="kv"><span>Owner Component</span><span class="mono tag">{{ r.attribution.className ?? '—' }}</span></div>
              @if (ownerNode(); as owner) {
                <div class="kv"><span></span><app-source-actions [node]="owner" /></div>
              }
              @if (r.attribution.ownerResource) {
                <div class="kv" data-testid="owner-resource"><span>Owner Resource</span><span class="mono tag">{{ r.attribution.ownerResource }}</span></div>
              } @else if (store.status()?.kind === 'production') {
                <div class="kv"><span>Owner Resource</span><span class="muted">Needs a development build</span></div>
              }
              <div class="kv"><span>Instance</span><span>{{ r.attribution.instanceId ?? (r.attribution.className ? 'several live instances' : '—') }}</span></div>
              <div class="kv"><span>Confidence</span><span [class]="'conf-' + r.attribution.confidence">{{ r.attribution.confidence }} ({{ r.attribution.via }})</span></div>
              @if (r.attribution.service) {
                <div class="kv"><span>Owner Service</span><span class="mono tag">{{ r.attribution.service }}</span></div>
              }
              @if (r.attribution.route) {
                <div class="kv"><span>Route</span><span class="mono">{{ r.attribution.route }}</span></div>
              }
              @if (r.attribution.group) {
                <div class="kv"><span>Unattributed group</span><span class="mono">{{ r.attribution.group }}</span></div>
              }
              <h4>Call Chain</h4>
              <div class="chain mono" data-testid="call-chain">{{ r.attribution.callChain.join(' → ') }}</div>
            </section>
          }
        }
      </div>

      <ng-template #bodyView let-body>
        @switch (body.kind) {
          @case ('none') {
            <div class="muted">No body.</div>
          }
          @case ('form') {
            @for (e of body.entries; track $index) {
              <div class="kv"><span>{{ e[0] }}</span><span class="mono">{{ e[1] }}</span></div>
            }
          }
          @case ('binary') {
            <div class="muted">Binary body ({{ body.mime ?? 'unknown type' }}, {{ formatBytes(body.size) }}) — not stored.</div>
          }
          @default {
            <pre class="mono">{{ pretty(body) }}</pre>
          }
        }
      </ng-template>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; height: 100%; min-height: 0; }
    .tabs { display: flex; align-items: center; gap: 2px; border-bottom: 1px solid var(--border); background: var(--toolbar); padding: 0 4px; flex-wrap: wrap; }
    .tabs button { border: none; background: none; padding: 4px 8px; color: var(--fg); }
    .tabs button.active { border-bottom: 2px solid var(--accent); }
    .count { background: var(--badge); border-radius: 8px; padding: 0 5px; font-size: 11px; margin-left: 2px; }
    .token { border-top: 1px solid var(--border); padding: 6px 0; }
    .exp-valid { color: var(--ok); }
    .exp-expiring { color: var(--warn); font-weight: 600; }
    .exp-expired { color: var(--error); }
    .actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 3px 8px; border-bottom: 1px solid var(--border); background: var(--toolbar); }
    .label { display: inline-flex; align-items: center; gap: 4px; }
    .copied { color: var(--accent); padding: 0 6px; }
    .unmasked { color: var(--muted); }
    .body { overflow: auto; padding: 6px 10px; flex: 1; }
    h4 { margin: 8px 0 4px; font-size: 12px; }
    details { margin: 4px 0; }
    summary { cursor: pointer; font-weight: 600; padding: 2px 0; user-select: none; }
    details[open] > summary { margin-bottom: 2px; }
    .kv { display: grid; grid-template-columns: minmax(120px, 30%) 1fr; gap: 8px; padding: 1px 0; }
    .kv > span:first-child { color: var(--muted); }
    .kv > span:last-child { word-break: break-all; }
    .masked { cursor: pointer; }
    .header-name { display: flex; align-items: flex-start; gap: 2px; }
    .copy-header { visibility: hidden; padding: 0 2px; color: var(--muted); }
    .kv:hover .copy-header, .copy-header:focus-visible { visibility: visible; }
    .muted { color: var(--muted); }
    .error { color: var(--error); }
    .ok { color: var(--ok); }
    a { color: var(--accent); }
    a.current { font-weight: 600; text-decoration: none; color: var(--fg); }
    pre { margin: 0; white-space: pre-wrap; word-break: break-all; }
    .tag { color: var(--tag); }
    .conf-context { color: var(--ok); }
    .conf-stack { color: var(--warn); }
    .conf-none { color: var(--error); }
    .chain { padding: 4px 0; }
    .steps { margin: 4px 0; padding-left: 20px; }
    .steps li { padding: 3px 0; }
    .step-head { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
    .sc { background: var(--badge); border-radius: 8px; padding: 0 6px; font-size: 11px; }
    .add { color: var(--ok); }
    .del { color: var(--error); }
    .chg { color: var(--warn); }
  `,
})
export class RequestDetail {
  protected readonly store = inject(InspectorStore);
  protected readonly icons = ICONS;
  protected readonly tab = signal<Tab>('headers');
  protected readonly unmasked = signal(false);
  protected readonly revealed = signal<ReadonlySet<string>>(new Set());
  protected readonly copied = signal<string | null>(null);
  protected readonly tabs: { id: Tab; label: string }[] = [
    { id: 'headers', label: 'Headers' },
    { id: 'payload', label: 'Payload' },
    { id: 'response', label: 'Response' },
    { id: 'preview', label: 'Preview' },
    { id: 'timing', label: 'Timing' },
    { id: 'initiator', label: 'Initiator' },
    { id: 'interceptors', label: 'Interceptors' },
    { id: 'tokens', label: 'Tokens' },
    { id: 'contract', label: 'Contract' },
    { id: 'replay', label: 'Replay' },
  ];
  protected readonly statusLabel = statusLabel;
  protected readonly typeLabel = typeLabel;
  protected readonly formatBytes = formatBytes;
  protected readonly formatDuration = formatDuration;

  protected readonly maskText = MASK;
  /** Ticks once a second while the Tokens tab is open, to drive the `exp` countdown. */
  private readonly now = signal(Date.now());
  protected readonly tokens = computed(() => {
    const r = this.store.selectedRequest();
    return r ? findTokens(r) : [];
  });

  constructor() {
    effect((onCleanup) => {
      if (this.tab() !== 'tokens' || !this.tokens().length) return;
      this.now.set(Date.now());
      const id = setInterval(() => this.now.set(Date.now()), 1000);
      onCleanup(() => clearInterval(id));
    });
  }

  protected tokenKey(index: number): string {
    return `${this.store.selectedRequest()!.id}:token${index}`;
  }

  /** A Token inside a masked header or cookie stays hidden until Unmasked or revealed; query and body Tokens are never masked. */
  protected tokenHidden(t: Token, index: number): boolean {
    return t.headerName !== null && !this.unmasked() && !this.revealed().has(this.tokenKey(index)) && this.store.masker().isMasked(t.headerName);
  }

  protected expiry(t: Token) {
    return expiryState(t, this.now());
  }

  protected expiryText(t: Token): string {
    return expiryLabel(this.expiry(t));
  }

  protected sentExpired(t: Token): boolean {
    return expiredAtSend(t, this.store.selectedRequest()!);
  }

  /** Claims as rows; time claims (`exp`, `iat`, `nbf`) also show their date. */
  protected entries(claims: Record<string, unknown>): [string, string][] {
    return Object.entries(claims).map(([k, v]) => {
      const text = typeof v === 'string' ? v : JSON.stringify(v);
      const isTime = ['exp', 'iat', 'nbf'].includes(k) && typeof v === 'number';
      return [k, isTime ? `${text}  (${new Date((v as number) * 1000).toISOString()})` : text];
    });
  }

  private readonly mask = computed(() => (this.unmasked() ? null : this.store.masker()));
  protected readonly isEmptyDiff = isEmptyDiff;
  /** Interceptor Steps need a development build (ADR 10). */
  protected readonly devBuild = computed(() => this.store.status()?.kind === 'dev');

  /** Masked headers stay masked in Interceptor Step diffs (unless "Unmasked"). */
  protected headerShown(name: string, value: string): string {
    return !this.unmasked() && this.store.masker().isMasked(name) ? MASK : value;
  }

  /** Every attempt of the request's retry chain. */
  protected attemptsOf(id: string) {
    return this.store.retryChains().get(id)?.attempts ?? [];
  }

  protected readonly requestHeaders = computed(() => {
    const r = this.store.selectedRequest();
    if (!r) return [];
    return r.enrichment?.requestHeaders.length ? r.enrichment.requestHeaders : r.requestHeaders;
  });
  protected readonly query = computed(() => {
    try {
      return [...new URL(this.store.selectedRequest()!.url).searchParams];
    } catch {
      return [];
    }
  });
  protected readonly responseText = computed(() => {
    const r = this.store.selectedRequest();
    return r ? bodyText(r.responseBody) : null;
  });
  protected readonly previewJson = computed(() => {
    const body = this.store.selectedRequest()?.responseBody;
    if (body?.kind !== 'json' || body.truncated) return null;
    try {
      return { value: JSON.parse(body.text) as unknown };
    } catch {
      return null;
    }
  });
  protected readonly started = computed(() => {
    const r = this.store.selectedRequest();
    return r ? formatTimestamp(r) : '';
  });
  /** Quick-copy Headers the selected request carries (ADR 6: raw values). */
  protected readonly quickCopies = computed(() => {
    const r = this.store.selectedRequest();
    if (!r) return [];
    return this.store.quickCopyHeaders().flatMap((name) => {
      const value = headerValue(r, name);
      return value === null ? [] : [{ name, value, token: bearerToken(value) }];
    });
  });
  /** The Owner Component's tree node (current page only: Instance Ids do not survive a reload). */
  protected readonly ownerNode = computed(() => {
    const r = this.store.selectedRequest();
    if (!r?.id.startsWith(`${this.store.pageId()}:`)) return null;
    return this.store.nodeById(r.attribution.instanceId);
  });
  protected readonly curl = computed(() => toCurl(this.store.selectedRequest()!, this.mask()));
  protected readonly fetchCode = computed(() => toFetch(this.store.selectedRequest()!, this.mask()));
  protected readonly playwrightStub = computed(() => toPlaywrightStub([this.store.selectedRequest()!], this.mask()));
  protected readonly cypressStub = computed(() => toCypressStub([this.store.selectedRequest()!], this.mask()));

  protected isMasked(h: Header, key: string): boolean {
    return !this.unmasked() && !this.revealed().has(key) && this.store.masker().isMasked(h[0]);
  }

  protected shown(h: Header, key: string): string {
    return this.isMasked(h, key) ? `${MASK}  (click to reveal)` : h[1];
  }

  protected reveal(key: string): void {
    this.revealed.update((s) => new Set(s).add(key));
  }

  protected pretty(body: Body): string {
    if (body.kind !== 'json') return bodyText(body) ?? '';
    try {
      return JSON.stringify(JSON.parse(body.text), null, 2);
    } catch {
      return body.text;
    }
  }

  protected truncated(body: Body): boolean {
    return (body.kind === 'json' || body.kind === 'text') && body.truncated;
  }

  /** Header copy is never masked (ADR 6); the confirmation says when the value was hidden on screen. */
  protected copyHeader(h: Header): void {
    void this.copy(h[1], this.store.headerCopyLabel(h[0]));
  }

  protected async copy(text: string, what: string): Promise<void> {
    await copyText(text);
    this.copied.set(what);
    setTimeout(() => this.copied.set(null), 1500);
  }
}
