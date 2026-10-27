import { Component, computed, inject, input, output } from '@angular/core';
import { buildContract, endpointOf, shapeRows, toTypeScript, type CapturedRequest, type SkipReason } from '@ngtrace/protocol';
import { formatTimestamp } from './format';
import { InspectorStore } from './inspector.store';

const SKIP_TEXT: Record<SkipReason, string> = { truncated: 'Truncated, not inferred', 'not-json': 'No JSON body' };

/** Contract tab: the shape inferred from an Endpoint's 2xx JSON responses, its Drift, and Copy as TypeScript. */
@Component({
  selector: 'app-request-contract',
  template: `
    <div class="head">
      <span class="mono tag" data-testid="contract-endpoint">{{ contract().endpoint }}</span>
      <span class="muted" data-testid="contract-used">from {{ contract().used.length }} {{ contract().used.length === 1 ? 'response' : 'responses' }}</span>
      @if (typescript()) {
        <button (click)="copyTypescript.emit(typescript())" data-testid="copy-typescript" title="Copy the inferred shape as TypeScript interfaces">Copy as TypeScript</button>
      }
    </div>
    @if (ownProblem(); as problem) {
      <div class="muted" data-testid="contract-own-note">This response: {{ problem }}.</div>
    }
    @if (rows().length) {
      <section class="shape mono" data-testid="contract-shape">
        @for (row of rows(); track $index) {
          <div class="row" [style.padding-left.px]="row.depth * 14">
            <span class="key">{{ row.label }}</span>{{ row.optional ? '?' : '' }}: <span class="type">{{ row.types }}</span>
          </div>
        }
      </section>
    } @else {
      <div class="muted" data-testid="contract-empty">No JSON body to infer a Contract from.</div>
    }

    @if (contract().shape) {
      <h4>Drift</h4>
      @for (d of contract().drift; track $index) {
        <div class="drift" data-testid="drift-entry">
          <span class="mono tag">{{ d.path }}</span> <span class="kind" data-testid="drift-kind">{{ d.kind }}</span>
          @for (v of d.variants; track v.label) {
            <div class="variant">
              <span class="mono">{{ v.label }}</span> ({{ v.requestIds.length }}):
              @for (id of v.requestIds; track id) {
                <a href="" (click)="$event.preventDefault(); select(id)" data-testid="drift-link">{{ time(id) }}</a>
              }
            </div>
          }
        </div>
      } @empty {
        <div class="muted" data-testid="no-drift">No Drift across {{ contract().used.length }} {{ contract().used.length === 1 ? 'response' : 'responses' }}.</div>
      }
    }

    @if (contract().skipped.length) {
      <h4>Skipped</h4>
      @for (s of contract().skipped; track s.id) {
        <div class="muted" data-testid="contract-skipped"><a href="" (click)="$event.preventDefault(); select(s.id)">{{ time(s.id) }}</a>: {{ skipText[s.reason] }}</div>
      }
    }
  `,
  styles: `
    .head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
    h4 { margin: 10px 0 4px; font-size: 12px; }
    .shape { padding: 4px 0; line-height: 18px; }
    .key { color: var(--key); }
    .type { color: var(--number); }
    .tag { color: var(--tag); }
    .muted { color: var(--muted); }
    .drift { padding: 3px 0; }
    .kind { background: var(--badge); border-radius: 8px; padding: 0 6px; font-size: 11px; }
    .variant { padding-left: 14px; }
    a { color: var(--accent); margin-right: 6px; }
  `,
})
export class RequestContract {
  readonly request = input.required<CapturedRequest>();
  readonly copyTypescript = output<string>();
  private readonly store = inject(InspectorStore);
  protected readonly skipText = SKIP_TEXT;

  protected readonly contract = computed(() => buildContract(this.store.requests(), endpointOf(this.request())));
  protected readonly rows = computed(() => {
    const shape = this.contract().shape;
    return shape ? shapeRows(shape) : [];
  });
  protected readonly typescript = computed(() => toTypeScript(this.contract()));

  /** Why the selected response itself is not part of the Contract, if so. */
  protected readonly ownProblem = computed(() => {
    const r = this.request();
    const skipped = this.contract().skipped.find((s) => s.id === r.id);
    if (skipped) return SKIP_TEXT[skipped.reason].toLowerCase();
    if (r.status === null || r.status < 200 || r.status > 299) return 'not a 2xx response, so it is not part of the Contract';
    return null;
  });

  protected time(id: string): string {
    const r = this.store.requests().find((x) => x.id === id);
    return r ? formatTimestamp(r) : id;
  }

  protected select(id: string): void {
    const r = this.store.requests().find((x) => x.id === id);
    if (r) this.store.selectRequest(r);
  }
}
