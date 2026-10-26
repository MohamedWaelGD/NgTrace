/** Hover highlight box drawn over a component's host element, and the element picker. */
export class Overlay {
  private box: HTMLDivElement | null = null;
  private stopPicking: (() => void) | null = null;

  constructor(private readonly doc: Document) {}

  show(el: Element | undefined, label: string): void {
    if (!el) return this.hide();
    const rect = boundsOf(el);
    if (!rect) return this.hide();
    const box = this.ensureBox();
    Object.assign(box.style, {
      display: 'block',
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    box.firstElementChild!.textContent = label;
  }

  hide(): void {
    if (this.box) this.box.style.display = 'none';
  }

  /** Starts picking: hovering highlights the owning component, a click reports it. */
  pick(ownerOf: (el: Element) => number | null, labelOf: (id: number) => string, elementOf: (id: number) => Element | undefined, onPicked: (id: number, element: Element) => void): void {
    this.cancelPick();
    const move = (e: MouseEvent) => {
      const id = ownerOf(e.target as Element);
      if (id === null) this.hide();
      else this.show(elementOf(id), labelOf(id));
    };
    const click = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const id = ownerOf(e.target as Element);
      this.cancelPick();
      if (id !== null) onPicked(id, e.target as Element);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.cancelPick();
    };
    this.doc.addEventListener('mousemove', move, true);
    this.doc.addEventListener('click', click, true);
    this.doc.addEventListener('keydown', key, true);
    this.stopPicking = () => {
      this.doc.removeEventListener('mousemove', move, true);
      this.doc.removeEventListener('click', click, true);
      this.doc.removeEventListener('keydown', key, true);
      this.hide();
    };
  }

  cancelPick(): void {
    this.stopPicking?.();
    this.stopPicking = null;
  }

  private ensureBox(): HTMLDivElement {
    if (this.box?.isConnected) return this.box;
    const box = this.doc.createElement('div');
    box.setAttribute('data-ngapi-overlay', '');
    Object.assign(box.style, {
      position: 'fixed',
      zIndex: '2147483647',
      pointerEvents: 'none',
      background: 'rgba(66, 133, 244, 0.25)',
      outline: '1px solid rgb(66, 133, 244)',
    });
    const label = this.doc.createElement('span');
    Object.assign(label.style, {
      position: 'absolute',
      top: '-18px',
      left: '0',
      font: '11px/16px monospace',
      background: 'rgb(66, 133, 244)',
      color: 'white',
      padding: '0 4px',
      whiteSpace: 'nowrap',
    });
    box.appendChild(label);
    this.doc.documentElement.appendChild(box);
    this.box = box;
    return box;
  }
}

/** Host elements are often `display: inline` with no box; fall back to the union of their children. */
function boundsOf(el: Element): DOMRect | null {
  const own = el.getBoundingClientRect();
  if (own.width || own.height) return own;
  const rects = Array.from(el.children).map((c) => c.getBoundingClientRect()).filter((r) => r.width || r.height);
  if (!rects.length) return null;
  const top = Math.min(...rects.map((r) => r.top));
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}
