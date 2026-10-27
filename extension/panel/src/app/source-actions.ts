import { Component, computed, inject, input, signal } from '@angular/core';
import { editorTemplate, editorUrl, sourceUrlCandidates, type TreeNode } from '@ngtrace/protocol';
import { copyText } from './clipboard';
import { openResource } from './devtools';
import { InspectorStore, originOf } from './inspector.store';

/** Request-to-template jump for one component: Reveal in Elements, Open in Sources / editor, and its `file:line`. */
@Component({
  selector: 'app-source-actions',
  template: `
    @if (node(); as n) {
      <button
        [disabled]="n.destroyed"
        [title]="n.destroyed ? 'Component destroyed' : 'Select the host element in the Elements panel'"
        (click)="store.reveal(n.id)"
        data-testid="reveal"
      >
        Reveal in Elements
      </button>
      <button
        [disabled]="!n.filePath"
        [title]="n.filePath ? 'Open ' + location() + ' in the Sources panel' : 'Needs a development build'"
        (click)="openInSources(n)"
        data-testid="open-sources"
      >
        Open in Sources
      </button>
      @if (editorLink(); as url) {
        <a class="button" [href]="url" [title]="'Open in your editor: ' + url" (click)="openInEditor($event, url)" data-testid="open-editor">Open in editor</a>
      }
      @if (showLocation() && location(); as loc) {
        <span class="location mono" data-testid="source-location">{{ loc }}</span>
        <button class="icon" title="Copy file:line" aria-label="Copy file:line" (click)="copy(loc)" data-testid="copy-location">Copy</button>
      }
      @if (note(); as message) {
        <span class="note">{{ message }}</span>
      }
    }
  `,
  styles: `
    :host { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; }
    button:disabled { color: var(--muted); cursor: default; }
    a.button { color: var(--fg); text-decoration: none; border: 1px solid var(--border); border-radius: 3px; padding: 1px 6px; }
    .location { color: var(--muted); }
    .note { color: var(--muted); }
  `,
})
export class SourceActions {
  protected readonly store = inject(InspectorStore);
  readonly node = input.required<TreeNode | null>();
  /** Always show `file:line` (component details); otherwise only after opening failed. */
  readonly alwaysShowLocation = input(false);
  protected readonly note = signal<string | null>(null);
  private readonly failed = signal(false);

  protected readonly location = computed(() => {
    const n = this.node();
    return n?.filePath ? `${n.filePath}:${n.lineNumber ?? 1}` : null;
  });

  protected readonly showLocation = computed(() => this.alwaysShowLocation() || this.failed());

  /** Hidden without a project root for this origin (extension options). */
  protected readonly editorLink = computed(() => {
    const n = this.node();
    const settings = this.store.editorSettings();
    const template = editorTemplate(settings);
    if (!n?.filePath || !settings.projectRoot || !template) return null;
    return editorUrl(template, { root: settings.projectRoot, file: n.filePath, line: n.lineNumber ?? 1, column: 1 });
  });

  protected async openInSources(n: TreeNode): Promise<void> {
    const origin = originOf(this.store.pageUrl());
    if (!n.filePath || !origin) return;
    for (const url of sourceUrlCandidates(origin, n.filePath)) {
      if (await openResource(url, (n.lineNumber ?? 1) - 1)) return;
    }
    this.failed.set(true);
    this.flash('Not found in Sources — copy the location instead.');
  }

  /** Editor URLs use custom schemes: a new tab hands them to the OS. */
  protected openInEditor(event: Event, url: string): void {
    event.preventDefault();
    if (globalThis.chrome?.tabs) void chrome.tabs.create({ url, active: false });
    else window.open(url);
  }

  protected async copy(text: string): Promise<void> {
    await copyText(text);
    this.flash('Copied');
  }

  private flash(message: string): void {
    this.note.set(message);
    setTimeout(() => this.note.set(null), 2500);
  }
}
