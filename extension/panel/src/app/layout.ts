import { Directive, ElementRef, Injectable, inject, output, signal } from '@angular/core';

const STORAGE_KEY = 'ngapi.layout';

/** Pane sizes in px; null means the CSS default (22% tree, 45% detail, 50% details). */
export interface PaneSizes {
  tree: number | null;
  detail: number | null;
  details: number | null;
}

export const PANE_MIN = { tree: 180, table: 240, detail: 320, details: 80, componentTree: 60 } as const;

/** Resizable pane sizes, persisted per viewer in localStorage. */
@Injectable({ providedIn: 'root' })
export class PaneLayout {
  readonly sizes = signal<PaneSizes>(load());

  set(pane: keyof PaneSizes, px: number | null): void {
    this.sizes.update((s) => ({ ...s, [pane]: px === null ? null : Math.round(px) }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.sizes()));
    } catch {
      // storage unavailable: sizes last for this session only
    }
  }
}

function load(): PaneSizes {
  const empty: PaneSizes = { tree: null, detail: null, details: null };
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<PaneSizes> | null;
    return { ...empty, ...stored };
  } catch {
    return empty;
  }
}

export interface SplitterDrag {
  /** Pointer movement since the drag started, in px. */
  dx: number;
  dy: number;
}

/** Drag handle between two panes: reports movement since pointerdown; double-click resets. */
@Directive({
  selector: '[appSplitter]',
  host: {
    class: 'splitter',
    role: 'separator',
    title: 'Drag to resize, double-click to reset',
    '(pointerdown)': 'down($event)',
    '(pointermove)': 'move($event)',
    '(pointerup)': 'up($event)',
    '(lostpointercapture)': 'up($event)',
    '(dblclick)': 'reset.emit()',
  },
})
export class Splitter {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private origin: { x: number; y: number } | null = null;
  readonly dragStart = output<void>();
  readonly drag = output<SplitterDrag>();
  readonly reset = output<void>();

  protected down(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    this.el.nativeElement.setPointerCapture(event.pointerId);
    this.origin = { x: event.clientX, y: event.clientY };
    document.body.classList.add('resizing');
    this.dragStart.emit();
  }

  protected move(event: PointerEvent): void {
    if (!this.origin) return;
    this.drag.emit({ dx: event.clientX - this.origin.x, dy: event.clientY - this.origin.y });
  }

  protected up(event: PointerEvent): void {
    if (!this.origin) return;
    this.origin = null;
    document.body.classList.remove('resizing');
    if (this.el.nativeElement.hasPointerCapture(event.pointerId)) this.el.nativeElement.releasePointerCapture(event.pointerId);
  }
}

/** Keeps a pane size within [min, max]; min wins when the window is too small for both. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}
