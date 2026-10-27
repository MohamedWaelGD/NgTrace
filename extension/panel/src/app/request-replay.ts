import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import {
  bodyText,
  buildReplay,
  diffResponses,
  formatJson,
  joinUrl,
  needsConfirmation,
  replayability,
  splitUrl,
  type CapturedRequest,
  type Header,
  type ReplaySpec,
} from '@ngtrace/protocol';
import { InspectorStore } from './inspector.store';

/** Replay tab: re-send unchanged, or edit method, URL, headers and body first; then diff the new response. */
@Component({
  selector: 'app-request-replay',
  template: `
    @let r = request();
    @if (r.replayOf) {
      <div class="muted" data-testid="replay-of">Replay of <span class="mono">{{ r.replayOf }}</span></div>
    }
    @if (!replayableUnchanged().ok && !editing()) {
      <div class="notice-line" data-testid="replay-blocked">{{ blockedReason() }}</div>
    }
    <div class="actions">
      <button (click)="replay()" [disabled]="!replayableUnchanged().ok" data-testid="replay-button" title="Send the request again, unchanged">Replay</button>
      <button (click)="startEditing()" [disabled]="editing()" data-testid="edit-resend-button" title="Edit the request, then send it">Edit &amp; resend</button>
    </div>

    @if (pending(); as spec) {
      <div class="confirm" data-testid="replay-confirm">
        <span>
          Send <b>{{ spec.method }}</b> <span class="mono">{{ spec.url }}</span>? It can change real data.
        </span>
        <label><input type="checkbox" [checked]="store.skipReplayConfirm()" (change)="store.skipReplayConfirm.set(!store.skipReplayConfirm())" /> Don't ask again this session</label>
        <button (click)="confirm(spec)" data-testid="replay-confirm-send">Send</button>
        <button (click)="pending.set(null)">Cancel</button>
      </div>
    }

    @if (editing()) {
      <section class="editor" data-testid="replay-editor">
        <div class="row">
          <input class="method" [value]="method()" (input)="method.set($any($event.target).value)" data-testid="replay-method" aria-label="Method" />
          <input class="url" [value]="url()" (input)="url.set($any($event.target).value)" data-testid="replay-url" aria-label="URL (without the query string)" />
        </div>
        <h4>Query</h4>
        @for (q of query(); track $index) {
          <div class="row">
            <input class="hname" [value]="q[0]" (input)="setQuery($index, 0, $any($event.target).value)" [attr.data-testid]="'replay-query-name-' + $index" aria-label="Query parameter name" />
            <input class="hvalue" [value]="q[1]" (input)="setQuery($index, 1, $any($event.target).value)" [attr.data-testid]="'replay-query-value-' + $index" aria-label="Query parameter value" />
            <button (click)="removeQuery($index)" title="Remove parameter" aria-label="Remove parameter">×</button>
          </div>
        }
        <button (click)="addQuery()" data-testid="replay-add-query">Add parameter</button>
        <h4>Headers</h4>
        @for (h of headers(); track $index) {
          <div class="row">
            <input class="hname" [value]="h[0]" (input)="setHeader($index, 0, $any($event.target).value)" [attr.data-testid]="'replay-header-name-' + $index" aria-label="Header name" />
            <input class="hvalue" [value]="h[1]" (input)="setHeader($index, 1, $any($event.target).value)" [attr.data-testid]="'replay-header-value-' + $index" aria-label="Header value" />
            <button (click)="removeHeader($index)" title="Remove header" aria-label="Remove header">×</button>
          </div>
        }
        <button (click)="addHeader()" data-testid="replay-add-header">Add header</button>
        <h4>
          Body
          <button (click)="format('pretty')" data-testid="replay-format" title="Pretty-print the body as JSON">Format</button>
          <button (click)="format('minify')" data-testid="replay-minify" title="Minify the body as JSON">Minify</button>
        </h4>
        @if (bodyError()) {
          <div class="muted" data-testid="replay-body-error">The body is not valid JSON.</div>
        }
        <textarea [value]="bodyValue()" (input)="bodyEdit.set($any($event.target).value); bodyError.set(false)" rows="10" data-testid="replay-body" aria-label="Body"></textarea>
        <div class="actions">
          <button (click)="send()" [disabled]="!replayable().ok" data-testid="replay-send">Send</button>
          <button (click)="editing.set(false)">Cancel</button>
        </div>
      </section>
    }

    @if (replays().length > 1) {
      <label class="muted">
        Compare with
        <select [value]="chosenId() ?? ''" (change)="chosen.set($any($event.target).value)" data-testid="replay-choose">
          @for (p of replays(); track p.id) {
            <option [value]="p.id">{{ label(p) }}</option>
          }
        </select>
      </label>
    }

    @if (diff(); as d) {
      <section class="diff" data-testid="replay-diff">
        <h4>Original vs replay</h4>
        <div class="kv" data-testid="diff-status">
          <span>Status</span>
          <span>{{ d.status ? d.status.from + ' → ' + d.status.to : 'unchanged' }}</span>
        </div>
        <h4>Headers</h4>
        @for (h of d.headers; track h.name) {
          <div class="change" [class]="'change ' + h.change">
            <span class="mono">{{ h.name }}</span>
            <span class="mono">{{ h.from ?? '' }}{{ h.from !== undefined && h.to !== undefined ? ' → ' : '' }}{{ h.to ?? '' }}</span>
          </div>
        } @empty {
          <div class="muted">No header changes.</div>
        }
        <h4>Body</h4>
        @switch (d.body.kind) {
          @case ('same') {
            <div class="muted" data-testid="diff-body">Body unchanged.</div>
          }
          @case ('unavailable') {
            <div class="muted" data-testid="diff-body">Binary bodies cannot be compared.</div>
          }
          @case ('json') {
            <div data-testid="diff-body">
              @for (c of jsonChanges(d); track c.path) {
                <div class="change" [class]="'change ' + c.change">
                  <span class="mono">{{ c.path }}</span>
                  <span class="mono">{{ show(c.from) }}{{ c.change === 'changed' ? ' → ' : '' }}{{ show(c.to) }}</span>
                </div>
              }
            </div>
          }
          @case ('text') {
            <pre class="mono" data-testid="diff-body">@for (l of textLines(d); track $index) {<span [class]="'line ' + l.op">{{ l.op === 'add' ? '+ ' : l.op === 'remove' ? '- ' : '  ' }}{{ l.text }}
</span>}</pre>
          }
        }
      </section>
    } @else if (!r.replayOf && replays().length === 0) {
      <div class="muted">No replays yet.</div>
    } @else if (replays().length) {
      <div class="muted">Waiting for the replayed response…</div>
    }
  `,
  styles: `
    :host { display: block; }
    .actions { display: flex; gap: 6px; margin: 6px 0; }
    .row { display: flex; gap: 4px; margin: 2px 0; }
    .method { width: 70px; }
    .url, .hvalue { flex: 1; min-width: 0; }
    .hname { width: 180px; }
    input, textarea, select { background: var(--bg); color: var(--fg); border: 1px solid var(--border); font-family: var(--mono); font-size: 12px; }
    textarea { width: 100%; box-sizing: border-box; }
    h4 { margin: 8px 0 4px; font-size: 12px; }
    .kv { display: grid; grid-template-columns: minmax(120px, 30%) 1fr; gap: 8px; }
    .notice-line, .confirm { background: var(--notice); border: 1px solid var(--border); padding: 4px 8px; margin: 4px 0; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .muted { color: var(--muted); }
    .change { display: grid; grid-template-columns: minmax(120px, 30%) 1fr; gap: 8px; padding: 1px 4px; word-break: break-all; }
    .change.added { background: color-mix(in srgb, var(--ok) 18%, transparent); }
    .change.removed { background: color-mix(in srgb, var(--error) 18%, transparent); }
    .change.changed { background: color-mix(in srgb, var(--warn) 18%, transparent); }
    pre { margin: 0; white-space: pre-wrap; }
    .line.add { background: color-mix(in srgb, var(--ok) 18%, transparent); display: block; }
    .line.remove { background: color-mix(in srgb, var(--error) 18%, transparent); display: block; }
    .line.same { display: block; color: var(--muted); }
  `,
})
export class RequestReplay {
  protected readonly store = inject(InspectorStore);
  readonly request = input.required<CapturedRequest>();

  protected readonly editing = signal(false);
  protected readonly method = signal('GET');
  protected readonly url = signal('');
  protected readonly query = signal<Header[]>([]);
  protected readonly bodyError = signal(false);
  protected readonly headers = signal<Header[]>([]);
  /** null: the body is untouched. */
  protected readonly bodyEdit = signal<string | null>(null);
  /** A side-effecting replay waiting for the user's go-ahead. */
  protected readonly pending = signal<ReplaySpec | null>(null);
  protected readonly chosen = signal<string | null>(null);

  /** The request the diff is against: the original, even when a replay is selected. */
  private readonly original = computed(() => {
    const r = this.request();
    return (r.replayOf && this.store.requests().find((x) => x.id === r.replayOf)) || r;
  });

  protected readonly replays = computed(() => this.store.requests().filter((x) => x.replayOf === this.original().id));

  protected readonly chosenId = computed(() => {
    const r = this.request();
    if (r.replayOf) return r.id;
    return this.chosen() ?? this.replays().at(-1)?.id ?? null;
  });

  private readonly target = computed(() => this.replays().find((x) => x.id === this.chosenId()) ?? null);

  protected readonly diff = computed(() => {
    const t = this.target();
    return t && (t.endTime !== null || t.error) ? diffResponses(this.original(), t) : null;
  });

  protected readonly replayable = computed(() => replayability(this.request(), this.bodyEdit()));
  protected readonly replayableUnchanged = computed(() => replayability(this.request(), null));
  protected readonly blockedReason = computed(() => {
    const r = this.replayableUnchanged();
    return r.ok ? '' : `${r.reason} Edit & resend with a replacement body to replay it.`;
  });

  protected readonly bodyValue = computed(() => this.bodyEdit() ?? bodyText(this.request().requestBody) ?? '');

  constructor() {
    // A different request starts with a closed editor and no pending confirmation.
    const id = computed(() => this.request().id);
    effect(() => {
      id();
      untracked(() => {
        this.editing.set(false);
        this.pending.set(null);
        this.bodyEdit.set(null);
        this.chosen.set(null);
        this.bodyError.set(false);
      });
    });
  }

  protected startEditing(): void {
    const r = this.request();
    const { base, query } = splitUrl(r.url);
    this.method.set(r.method);
    this.url.set(base);
    this.query.set(query);
    this.headers.set(this.store.masker().headers(r.requestHeaders));
    // JSON bodies open pretty-printed, ready to edit; binary or truncated ones start empty.
    const text = bodyText(r.requestBody);
    const pretty = r.requestBody.kind === 'json' && replayability(r, null).ok && text ? formatJson(text, 'pretty') : null;
    this.bodyEdit.set(pretty);
    this.bodyError.set(false);
    this.editing.set(true);
  }

  protected setQuery(index: number, part: 0 | 1, value: string): void {
    this.query.update((list) => list.map((q, i) => (i === index ? (part === 0 ? [value, q[1]] : [q[0], value]) : q)));
  }

  protected addQuery(): void {
    this.query.update((list) => [...list, ['', '']]);
  }

  protected removeQuery(index: number): void {
    this.query.update((list) => list.filter((_, i) => i !== index));
  }

  protected format(mode: 'pretty' | 'minify'): void {
    const formatted = formatJson(this.bodyValue(), mode);
    this.bodyError.set(formatted === null);
    if (formatted !== null) this.bodyEdit.set(formatted);
  }

  protected setHeader(index: number, part: 0 | 1, value: string): void {
    this.headers.update((list) => list.map((h, i) => (i === index ? (part === 0 ? [value, h[1]] : [h[0], value]) : h)));
  }

  protected addHeader(): void {
    this.headers.update((list) => [...list, ['', '']]);
  }

  protected removeHeader(index: number): void {
    this.headers.update((list) => list.filter((_, i) => i !== index));
  }

  /** Re-send unchanged (app-level headers; the browser adds its own again). */
  protected replay(): void {
    const r = this.request();
    this.dispatch(
      buildReplay(r, { method: r.method, url: r.url, headers: this.store.masker().headers(r.requestHeaders), body: bodyText(r.requestBody) }, this.store.masker()),
    );
  }

  protected send(): void {
    const body = this.bodyValue();
    this.dispatch(
      buildReplay(
        this.request(),
        { method: this.method(), url: joinUrl(this.url(), this.query()), headers: this.headers(), body: this.bodyEdit() === null && !body ? null : body },
        this.store.masker(),
      ),
    );
  }

  private dispatch(spec: ReplaySpec): void {
    if (needsConfirmation(spec.method) && !this.store.skipReplayConfirm()) {
      this.pending.set(spec);
      return;
    }
    this.confirm(spec);
  }

  protected confirm(spec: ReplaySpec): void {
    this.pending.set(null);
    this.editing.set(false);
    this.chosen.set(null);
    this.store.replay(spec);
  }

  protected label(p: CapturedRequest): string {
    return `${new Date(p.startTime).toLocaleTimeString(undefined, { hour12: false, fractionalSecondDigits: 3 })} · ${p.error ? 'failed' : (p.status ?? 'pending')}`;
  }

  protected show(value: unknown): string {
    return value === undefined ? '' : JSON.stringify(value);
  }

  protected jsonChanges(d: ReturnType<typeof diffResponses>) {
    return d.body.kind === 'json' ? d.body.changes : [];
  }

  protected textLines(d: ReturnType<typeof diffResponses>) {
    return d.body.kind === 'text' ? d.body.lines : [];
  }
}
