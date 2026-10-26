import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FILTER_KEYS, toHar, type HarLikeEntry, type StatusChip, type TypeChip } from '@ngapi/protocol';
import { ComponentTree } from './component-tree';
import { InspectorStore } from './inspector.store';
import { RequestDetail } from './request-detail';
import { RequestTable } from './request-table';

@Component({
  selector: 'app-root',
  imports: [ComponentTree, RequestTable, RequestDetail],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  protected readonly store = inject(InspectorStore);
  protected readonly typeChips: { id: TypeChip; label: string }[] = [
    { id: 'httpclient', label: 'HttpClient' },
    { id: 'xhr', label: 'Other XHR' },
    { id: 'fetch', label: 'Fetch' },
  ];
  protected readonly statusChips: StatusChip[] = ['2xx', '3xx', '4xx', '5xx', 'failed'];
  protected readonly suggestIndex = signal(0);
  protected readonly filterFocused = signal(false);

  /** Property-key autocomplete for the last term being typed. */
  protected readonly suggestions = computed(() => {
    const last = this.store.filterText().split(/\s+/).pop() ?? '';
    const term = last.replace(/^-/, '').toLowerCase();
    if (!term || term.includes(':')) return [];
    return FILTER_KEYS.filter((k) => k.startsWith(term)).map((k) => `${k}:`);
  });

  protected readonly statusMessage = computed(() => {
    const s = this.store.status();
    if (this.store.tabId === null) return 'Open this panel from DevTools.';
    if (!s) return 'Waiting for the page… If nothing appears, this origin is not enabled (see extension options) — reload the page after enabling.';
    switch (s.kind) {
      case 'pending':
        return 'Looking for Angular…';
      case 'not-angular':
        return 'This page is not an Angular app. Requests are still recorded.';
      case 'production':
        return `Angular ${s.version ?? ''} production build detected — component inspection needs a dev build (ng serve). Requests are still recorded but cannot be attributed.`;
      case 'dev':
        return null;
    }
  });

  protected readonly devInfo = computed(() => {
    const s = this.store.status();
    return s?.kind === 'dev' ? `Angular ${s.version ?? '?'} · dev mode · ${s.zone ? 'zone.js' : 'zoneless'}` : '';
  });

  ngOnInit(): void {
    const devtools = globalThis.chrome?.devtools;
    if (devtools?.panels?.themeName === 'dark') document.documentElement.classList.add('dark');
    devtools?.network?.onRequestFinished.addListener((entry) => this.store.applyHarEntry(entry as unknown as HarLikeEntry));
    void this.loadSettings();
    chrome.storage?.onChanged.addListener(() => void this.loadSettings());
    this.store.connect();
  }

  private async loadSettings(): Promise<void> {
    const stored = await chrome.storage?.sync.get('maskedHeaders');
    const names = stored?.['maskedHeaders'];
    if (Array.isArray(names)) this.store.maskedHeaders.set(names as string[]);
  }

  protected applySuggestion(key: string): void {
    const parts = this.store.filterText().split(/(\s+)/);
    const last = parts.pop() ?? '';
    parts.push((last.startsWith('-') ? '-' : '') + key);
    this.store.filterText.set(parts.join(''));
    this.suggestIndex.set(0);
  }

  protected onFilterKey(event: KeyboardEvent): void {
    const list = this.suggestions();
    if (!list.length) return;
    if (event.key === 'ArrowDown') {
      this.suggestIndex.set((this.suggestIndex() + 1) % list.length);
      event.preventDefault();
    } else if (event.key === 'ArrowUp') {
      this.suggestIndex.set((this.suggestIndex() - 1 + list.length) % list.length);
      event.preventDefault();
    } else if (event.key === 'Tab' || event.key === 'Enter') {
      this.applySuggestion(list[Math.min(this.suggestIndex(), list.length - 1)]);
      event.preventDefault();
    }
  }

  protected exportHar(unmasked: boolean): void {
    const har = toHar(this.store.visibleRequests(), unmasked ? null : this.store.masker());
    const blob = new Blob([JSON.stringify(har, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `angular-api-${new Date().toISOString().replace(/[:.]/g, '-')}.har`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}
