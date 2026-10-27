import { Component, inject, signal } from '@angular/core';
import { ruleError, type Header, type MockAction, type MockRule } from '@ngtrace/protocol';
import { InspectorStore } from './inspector.store';

const METHODS = ['*', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** Mock Rules editor: ordered list (first match wins), applied only while the panel is open (ADR 8). */
@Component({
  selector: 'app-mocks-pane',
  template: `
    <div class="head">
      <b>Mock Rules</b>
      <span class="muted">First match wins · applied only while this panel is open</span>
      <span class="spacer"></span>
      <button (click)="store.addMockRule()" data-testid="mock-add">Add rule</button>
    </div>
    @if (store.mockWarning(); as warning) {
      <div class="warning" data-testid="mock-warning">{{ warning }}</div>
    }
    @for (rule of store.mockRules(); track rule.id; let i = $index) {
      <div class="rule" [class.disabled]="!rule.enabled" data-testid="mock-rule">
        <div class="line">
          <input type="checkbox" [checked]="rule.enabled" (change)="store.updateMockRule(rule.id, { enabled: !rule.enabled })" data-testid="mock-enabled" aria-label="Enabled" />
          <select [value]="rule.method" (change)="store.updateMockRule(rule.id, { method: $any($event.target).value })" data-testid="mock-method" aria-label="Method">
            @for (m of methods; track m) {
              <option [value]="m" [selected]="m === rule.method">{{ m }}</option>
            }
          </select>
          <input class="pattern" [value]="rule.pattern" placeholder="/api/products/*" (input)="store.updateMockRule(rule.id, { pattern: $any($event.target).value })" data-testid="mock-pattern" aria-label="URL pattern" />
          <label><input type="checkbox" [checked]="rule.regex" (change)="store.updateMockRule(rule.id, { regex: !rule.regex })" /> regex</label>
          <span class="ac">
            <input
              class="component"
              [value]="rule.component ?? ''"
              placeholder="Owner Component (optional)"
              (input)="store.updateMockRule(rule.id, { component: $any($event.target).value.trim() || null })"
              (focus)="suggestFor.set(rule.id)"
              (blur)="suggestFor.set(null)"
              data-testid="mock-component"
              aria-label="Owner Component"
              autocomplete="off"
              spellcheck="false"
            />
            @if (suggestFor() === rule.id && suggestions(rule).length) {
              <ul class="suggest" data-testid="component-suggestions">
                @for (s of suggestions(rule); track s) {
                  <li (mousedown)="$event.preventDefault(); pick(rule, s)">{{ s }}</li>
                }
              </ul>
            }
          </span>
        </div>
        <div class="line">
          <select [value]="rule.action.kind" (change)="setAction(rule, $any($event.target).value)" data-testid="mock-action" aria-label="Action">
            <option value="respond" [selected]="rule.action.kind === 'respond'">Respond with…</option>
            <option value="error" [selected]="rule.action.kind === 'error'">Fail (network error)</option>
            <option value="delay" [selected]="rule.action.kind === 'delay'">Delay the real response</option>
            <option value="passthrough" [selected]="rule.action.kind === 'passthrough'">Pass through</option>
          </select>
          <label>
            + delay
            <input class="num" type="number" min="0" step="100" [value]="rule.delayMs" (input)="store.updateMockRule(rule.id, { delayMs: +$any($event.target).value || 0 })" data-testid="mock-delay" /> ms
          </label>
          @if (rule.action.kind === 'respond') {
            <label>
              status
              <input class="num" type="number" min="200" max="599" [value]="rule.action.status" (input)="setRespond(rule, { status: +$any($event.target).value || 200 })" data-testid="mock-status" />
            </label>
          }
          <span class="spacer"></span>
          <button (click)="store.moveMockRule(rule.id, -1)" [disabled]="i === 0" title="Move up" aria-label="Move up">↑</button>
          <button (click)="store.moveMockRule(rule.id, 1)" [disabled]="i === store.mockRules().length - 1" title="Move down" aria-label="Move down">↓</button>
          <button (click)="store.removeMockRule(rule.id)" title="Remove rule" aria-label="Remove rule" data-testid="mock-remove">×</button>
        </div>
        @if (rule.action.kind === 'respond') {
          <div class="line">
            <textarea class="body" rows="3" [value]="rule.action.body" placeholder="Response body" (input)="setRespond(rule, { body: $any($event.target).value })" data-testid="mock-body" aria-label="Response body"></textarea>
            <textarea class="headers" rows="3" [value]="headersText(rule)" placeholder="Header: value" (input)="setRespond(rule, { headers: parseHeaders($any($event.target).value) })" data-testid="mock-headers" aria-label="Response headers"></textarea>
          </div>
        }
        <div class="muted" data-testid="mock-matches">
          Matches {{ store.ruleMatches().get(rule.id) ?? 0 }} captured request{{ store.ruleMatches().get(rule.id) === 1 ? '' : 's' }}
        </div>
        @if (error(rule); as message) {
          <div class="error" data-testid="mock-error">{{ message }}</div>
        }
      </div>
    } @empty {
      <div class="muted pad">No rules yet. Add one here, or use "Mock this request…" on a request.</div>
    }
  `,
  styles: `
    :host { display: block; max-height: 280px; overflow: auto; border-bottom: 1px solid var(--border); background: var(--toolbar); padding: 4px 8px; }
    .head, .line { display: flex; gap: 6px; align-items: center; margin: 2px 0; flex-wrap: wrap; }
    .spacer { flex: 1; }
    .muted { color: var(--muted); }
    .pad { padding: 6px 0; }
    .rule { border-top: 1px solid var(--border); padding: 3px 0; }
    .rule.disabled { opacity: 0.55; }
    .pattern { flex: 1; min-width: 160px; }
    .component { width: 190px; }
    .num { width: 64px; }
    .body { flex: 2; min-width: 200px; }
    .headers { flex: 1; min-width: 160px; }
    input, textarea, select { background: var(--bg); color: var(--fg); border: 1px solid var(--border); font-family: var(--mono); font-size: 12px; }
    .warning { background: var(--notice); border: 1px solid var(--border); padding: 3px 8px; margin: 3px 0; color: var(--warn); }
    .error { color: var(--error); }
    .ac { position: relative; }
    .suggest { position: absolute; z-index: 5; left: 0; top: 100%; margin: 0; padding: 0; list-style: none; min-width: 100%; max-height: 160px; overflow: auto; background: var(--bg); border: 1px solid var(--border); font-family: var(--mono); }
    .suggest li { padding: 2px 8px; cursor: default; white-space: nowrap; }
    .suggest li:hover { background: var(--hover); }
  `,
})
export class MocksPane {
  protected readonly store = inject(InspectorStore);
  protected readonly methods = METHODS;
  /** The rule whose Owner Component field is focused (its suggestion list is open). */
  protected readonly suggestFor = signal<string | null>(null);

  /** Known components matching what is typed, each once; the exact current value is not offered again. */
  protected suggestions(rule: MockRule): string[] {
    const typed = (rule.component ?? '').toLowerCase();
    return this.store.knownComponents().filter((n) => n !== rule.component && n.toLowerCase().includes(typed));
  }

  protected pick(rule: MockRule, name: string): void {
    this.store.updateMockRule(rule.id, { component: name });
    this.suggestFor.set(null);
  }

  protected error(rule: MockRule): string | null {
    return ruleError(rule);
  }

  protected setAction(rule: MockRule, kind: MockAction['kind']): void {
    const action: MockAction =
      kind === 'respond'
        ? { kind, status: 200, headers: [['Content-Type', 'application/json']], body: '{}' }
        : ({ kind } as MockAction);
    this.store.updateMockRule(rule.id, { action });
  }

  protected setRespond(rule: MockRule, patch: Partial<Extract<MockAction, { kind: 'respond' }>>): void {
    if (rule.action.kind !== 'respond') return;
    this.store.updateMockRule(rule.id, { action: { ...rule.action, ...patch } });
  }

  protected headersText(rule: MockRule): string {
    return rule.action.kind === 'respond' ? rule.action.headers.map(([n, v]) => `${n}: ${v}`).join('\n') : '';
  }

  protected parseHeaders(text: string): Header[] {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.includes(':'))
      .map((line) => {
        const i = line.indexOf(':');
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()] as Header;
      });
  }
}
