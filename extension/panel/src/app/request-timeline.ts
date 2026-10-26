import { Component, computed, effect, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import {
  axisTicks,
  clampViewport,
  colorIndex,
  earliestStart,
  fitAll,
  fitNavigation,
  panViewport,
  placeSpan,
  routePhaseBands,
  spanOf,
  thumbOf,
  visibleRows,
  zoomViewport,
  type CapturedRequest,
  type Viewport,
} from '@ngapi/protocol';
import { shortName } from './format';
import { InspectorStore } from './inspector.store';

const ROW_HEIGHT = 20;
const LABEL_WIDTH = 200;

/** Timeline view: one row per visible request on a shared time axis. Rows are virtualised. */
@Component({
  selector: 'app-request-timeline',
  template: `
    <div class="bar-tools">
      <button (click)="fitAll()" data-testid="timeline-fit-all" title="Show every request and follow new ones">Fit all</button>
      <button (click)="fitNavigation()" data-testid="timeline-fit-nav" title="Zoom to the latest navigation">Fit navigation</button>
      <span class="hint">Ctrl+wheel to zoom · Shift+wheel, drag or the scrollbar to move through time · wheel scrolls rows</span>
    </div>
    <div class="axis">
      <span class="label-col"></span>
      <div class="ticks">
        @for (t of ticks(); track t.left) {
          <span class="tick" [style.left.%]="t.left">{{ t.label }}</span>
        }
      </div>
    </div>
    <div class="hscroll" #hscroll (pointerdown)="thumbDown($event)" (pointermove)="thumbMove($event)" (pointerup)="thumbUp($event)" data-testid="timeline-scrollbar">
      <div class="thumb" [style.left.%]="thumb().left" [style.width.%]="thumb().width" data-testid="timeline-thumb"></div>
    </div>
    <div class="body" #body (scroll)="scrollTop.set(body.scrollTop)" data-testid="timeline">
      <div class="canvas" [style.height.px]="rows().length * rowHeight">
        <div class="overlay">
          @for (b of bands(); track $index) {
            <div class="band" [class.resolve]="b.phase === 'resolve'" [style.left.%]="b.left" [style.width.%]="b.width" [title]="b.title" data-testid="timeline-band"></div>
          }
          @for (m of markers(); track $index) {
            <div class="marker" [class]="'marker ' + m.kind" [style.left.%]="m.left" [title]="m.title" data-testid="timeline-marker"></div>
          }
        </div>
        @for (row of slice(); track row.request.id) {
          <div
            class="row"
            [class.selected]="store.selectedRequestId() === row.request.id"
            [style.top.px]="row.index * rowHeight"
            (click)="store.selectRequest(row.request)"
            data-testid="timeline-row"
          >
            <span class="label-col" [title]="row.request.url">{{ row.label }}</span>
            <div class="track" (wheel)="onWheel($event)" (pointerdown)="dragStart($event)" (pointermove)="dragMove($event)" (pointerup)="dragEnd($event)">
              @if (row.place; as p) {
                <div
                  class="bar"
                  [class]="'bar c' + row.color"
                  [class.failed]="row.failed"
                  [style.left.%]="p.left"
                  [style.width.%]="p.width"
                  [title]="row.title"
                  data-testid="timeline-bar"
                >
                  @for (ph of row.phases; track ph.name) {
                    <span class="phase" [class]="'phase ph-' + ph.name" [style.flex-grow]="ph.ms"></span>
                  }
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
    .bar-tools { display: flex; gap: 6px; align-items: center; padding: 2px 6px; background: var(--toolbar); border-bottom: 1px solid var(--border); }
    .hint { color: var(--muted); margin-left: auto; }
    .axis { display: flex; border-bottom: 1px solid var(--border); background: var(--toolbar); height: 18px; }
    .label-col { flex: 0 0 200px; width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 6px; font-family: var(--mono); box-sizing: border-box; }
    .ticks { position: relative; flex: 1; }
    .tick { position: absolute; top: 2px; font-size: 10px; color: var(--muted); padding-left: 3px; border-left: 1px solid var(--border); }
    .body { flex: 1; overflow: auto; position: relative; }
    .hscroll { position: relative; height: 12px; margin-left: 200px; background: var(--toolbar); border-bottom: 1px solid var(--border); cursor: pointer; touch-action: none; }
    .thumb { position: absolute; top: 2px; bottom: 2px; background: var(--muted); opacity: 0.6; border-radius: 4px; min-width: 8px; }
    .hscroll:hover .thumb { opacity: 0.9; }
    .canvas { position: relative; }
    .overlay { position: absolute; left: 200px; right: 0; top: 0; bottom: 0; pointer-events: none; overflow: hidden; }
    .marker { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--accent); opacity: 0.7; }
    .marker.end { background: var(--ok); }
    .marker.cancel, .marker.error { background: var(--error); }
    .band { position: absolute; top: 0; bottom: 0; background: var(--warn); opacity: 0.12; }
    .band.resolve { background: var(--tag); }
    .row { position: absolute; left: 0; right: 0; height: 20px; display: flex; align-items: center; border-bottom: 1px solid var(--row-border); cursor: default; }
    .row:hover { background: var(--hover); }
    .row.selected { background: var(--selected); }
    .track { position: relative; flex: 1; height: 100%; cursor: grab; touch-action: none; }
    .bar { position: absolute; top: 4px; height: 12px; border-radius: 2px; display: flex; overflow: hidden; min-width: 2px; }
    .bar.failed { outline: 1px solid var(--error); }
    .phase { flex-basis: 0; }
    .phase.ph-blocked { background: rgba(255, 255, 255, 0.35); }
    .phase.ph-dns, .phase.ph-connect { background: rgba(255, 255, 255, 0.55); }
    .phase.ph-send, .phase.ph-wait { background: transparent; }
    .phase.ph-receive { background: rgba(0, 0, 0, 0.25); }
    .c0 { background: hsl(210 70% 55%); } .c1 { background: hsl(30 80% 55%); } .c2 { background: hsl(140 55% 45%); } .c3 { background: hsl(280 55% 60%); }
    .c4 { background: hsl(350 65% 58%); } .c5 { background: hsl(180 55% 42%); } .c6 { background: hsl(50 75% 48%); } .c7 { background: hsl(240 50% 62%); }
  `,
})
export class RequestTimeline {
  protected readonly store = inject(InspectorStore);
  protected readonly rowHeight = ROW_HEIGHT;
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private readonly hscroll = viewChild.required<ElementRef<HTMLElement>>('hscroll');
  protected readonly scrollTop = signal(0);
  /** null: follow every visible request. */
  private readonly viewport = signal<Viewport | null>(null);
  private drag: { x: number; vp: Viewport; width: number } | null = null;
  private thumbGrab: number | null = null;

  private readonly now = () => Date.now();

  /** Everything the scrollbar can reach: all visible requests. */
  private readonly total = computed<Viewport>(() => fitAll(this.store.visibleRequests(), this.now()) ?? { start: 0, end: 1000 });

  protected readonly vp = computed<Viewport>(() => this.viewport() ?? this.total());
  protected readonly thumb = computed(() => thumbOf(this.total(), this.vp()));

  constructor() {
    // A new page, or a cleared log, goes back to following the data.
    effect(() => {
      this.store.pageId();
      untracked(() => this.viewport.set(null));
    });
    effect(() => {
      if (!this.store.requests().length) untracked(() => this.viewport.set(null));
    });
  }

  protected readonly rows = computed(() => this.store.visibleRequests());

  protected readonly slice = computed(() => {
    const vp = this.vp();
    const rows = this.rows();
    const height = this.body()?.nativeElement.clientHeight || 400;
    const { first, last } = visibleRows({ total: rows.length, rowHeight: ROW_HEIGHT, scrollTop: this.scrollTop(), height, overscan: 4 });
    return rows.slice(first, last).map((request, i) => rowOf(request, first + i, vp, this.now()));
  });

  protected readonly bands = computed(() => {
    const vp = this.vp();
    return routePhaseBands(this.store.navigation()).flatMap((b) => {
      const p = placeSpan(b, vp);
      return p ? [{ ...p, phase: b.phase, title: `${b.phase === 'guard' ? 'Guards' : 'Resolvers'}: ${b.url}` }] : [];
    });
  });

  protected readonly markers = computed(() => {
    const vp = this.vp();
    return this.store
      .navigation()
      .filter((e) => e.kind === 'start' || e.kind === 'end' || e.kind === 'cancel' || e.kind === 'error')
      .flatMap((e) => {
        const p = placeSpan({ start: e.at, end: e.at }, vp);
        return p ? [{ left: p.left, kind: e.kind, title: `Navigation ${e.kind}: ${e.url}` }] : [];
      });
  });

  protected readonly ticks = computed(() => {
    const vp = this.vp();
    return axisTicks(vp, earliestStart(this.store.visibleRequests(), this.now()) ?? vp.start);
  });

  protected fitAll(): void {
    this.viewport.set(null);
  }

  protected fitNavigation(): void {
    this.viewport.set(fitNavigation(this.store.navigation(), this.store.visibleRequests(), this.now()));
  }

  /** Ctrl/Cmd+wheel zooms at the cursor, Shift+wheel (or a sideways wheel) pans; a plain wheel scrolls the rows. */
  protected onWheel(event: WheelEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const anchor = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      this.viewport.set(clampViewport(zoomViewport(this.vp(), event.deltaY < 0 ? 0.8 : 1.25, anchor), this.total()));
      return;
    }
    const sideways = event.shiftKey ? event.deltaY || event.deltaX : event.deltaX;
    if (!sideways) return;
    event.preventDefault();
    const vp = this.vp();
    this.viewport.set(clampViewport(panViewport(vp, (sideways / rect.width) * (vp.end - vp.start)), this.total()));
  }

  protected thumbDown(event: PointerEvent): void {
    const bar = this.hscroll().nativeElement;
    bar.setPointerCapture?.(event.pointerId);
    const rect = bar.getBoundingClientRect();
    const thumb = this.thumb();
    const thumbLeft = rect.left + (thumb.left / 100) * rect.width;
    const thumbWidth = (thumb.width / 100) * rect.width;
    const onThumb = event.clientX >= thumbLeft && event.clientX <= thumbLeft + thumbWidth;
    // Grab the thumb where it was hit; a click on the bar centres the thumb on the pointer.
    this.thumbGrab = onThumb ? event.clientX - thumbLeft : thumbWidth / 2;
    this.moveThumb(event.clientX);
  }

  protected thumbMove(event: PointerEvent): void {
    if (this.thumbGrab !== null) this.moveThumb(event.clientX);
  }

  protected thumbUp(event: PointerEvent): void {
    this.hscroll().nativeElement.releasePointerCapture?.(event.pointerId);
    this.thumbGrab = null;
  }

  private moveThumb(clientX: number): void {
    const rect = this.hscroll().nativeElement.getBoundingClientRect();
    const total = this.total();
    const vp = this.vp();
    const left = (clientX - this.thumbGrab! - rect.left) / rect.width;
    const start = total.start + left * (total.end - total.start);
    this.viewport.set(clampViewport({ start, end: start + (vp.end - vp.start) }, total));
  }

  protected dragStart(event: PointerEvent): void {
    const track = event.currentTarget as HTMLElement;
    track.setPointerCapture?.(event.pointerId);
    this.drag = { x: event.clientX, vp: this.vp(), width: track.getBoundingClientRect().width };
  }

  protected dragMove(event: PointerEvent): void {
    if (!this.drag) return;
    const span = this.drag.vp.end - this.drag.vp.start;
    this.viewport.set(clampViewport(panViewport(this.drag.vp, (-(event.clientX - this.drag.x) / this.drag.width) * span), this.total()));
  }

  protected dragEnd(event: PointerEvent): void {
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    this.drag = null;
  }
}

function rowOf(request: CapturedRequest, index: number, vp: Viewport, now: number) {
  const owner = request.attribution.className ?? request.attribution.service ?? request.attribution.group ?? 'unattributed';
  const span = spanOf(request, now);
  const total = request.enrichment?.phases?.reduce((sum, p) => sum + p.ms, 0) ?? 0;
  return {
    request,
    index,
    label: `${request.method} ${shortName(request.url)}`,
    color: colorIndex(owner),
    failed: !!request.error || (request.status !== null && request.status >= 400),
    place: placeSpan(span, vp),
    phases: total > 0 ? request.enrichment!.phases! : [],
    title: `${owner} · ${Math.round(span.end - span.start)} ms`,
  };
}
