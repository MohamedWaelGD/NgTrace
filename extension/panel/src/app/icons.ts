import { Component, input } from '@angular/core';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  CleanIcon,
  CodeIcon,
  CommandLineIcon,
  Copy01Icon,
  CursorPointer01Icon,
  FileDownloadIcon,
  FileExportIcon,
  Key01Icon,
  Link01Icon,
  RecordIcon,
  Refresh01Icon,
  SquareUnlock01Icon,
  Unlink02Icon,
} from '@hugeicons/core-free-icons';

/** Hugeicons (free, Stroke Rounded) used by the panel, bundled — MV3 forbids remote code. */
export const ICONS = {
  record: RecordIcon,
  clear: CleanIcon,
  refresh: Refresh01Icon,
  close: Cancel01Icon,
  expanded: ArrowDown01Icon,
  collapsed: ArrowRight01Icon,
  picker: CursorPointer01Icon,
  unattributed: Unlink02Icon,
  copy: Copy01Icon,
  url: Link01Icon,
  curl: CommandLineIcon,
  fetch: CodeIcon,
  response: FileDownloadIcon,
  exportHar: FileExportIcon,
  unmasked: SquareUnlock01Icon,
  key: Key01Icon,
};

/** Expand/collapse chevron for tree rows; renders an empty slot when the row has no children. */
@Component({
  selector: 'app-twisty',
  imports: [HugeiconsIconComponent],
  template: `
    @if (expandable()) {
      <hugeicons-icon [icon]="open() ? icons.expanded : icons.collapsed" [size]="12" [strokeWidth]="2" />
    }
  `,
  styles: `
    :host { display: inline-flex; align-items: center; justify-content: center; width: 12px; height: 12px; flex: none; color: var(--muted); cursor: pointer; vertical-align: middle; }
  `,
})
export class Twisty {
  readonly open = input(false);
  readonly expandable = input(true);
  protected readonly icons = ICONS;
}
