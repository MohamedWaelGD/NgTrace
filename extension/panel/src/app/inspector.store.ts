import { computed, Injectable, signal } from '@angular/core';
import {
  createMasker,
  createRequestFilter,
  DEFAULT_MASKED_HEADERS,
  enrich,
  type AngularStatus,
  type CapturedRequest,
  type HarLikeEntry,
  type HookMessage,
  type InputValue,
  type PanelCommand,
  type StatusChip,
  type TreeNode,
  type TypeChip,
} from '@ngapi/protocol';

/** Virtual tree selection for requests without an Owner Component. */
export const UNATTRIBUTED = -1;

export interface TreeRow {
  node: TreeNode;
  depth: number;
  count: number;
  hasChildren: boolean;
}

/** Panel state: connection to the hook (via the background), requests, tree, selection and filters. */
@Injectable({ providedIn: 'root' })
export class InspectorStore {
  readonly tabId = resolveTabId();
  readonly connected = signal(false);
  readonly status = signal<AngularStatus | null>(null);
  readonly pageUrl = signal('');
  readonly pageId = signal<string | null>(null);
  readonly tree = signal<TreeNode[]>([]);
  readonly requests = signal<CapturedRequest[]>([]);
  readonly inputs = signal<{ id: number; values: InputValue[] } | null>(null);

  // Toolbar state
  readonly paused = signal(false);
  readonly preserveLog = signal(false);
  readonly picking = signal(false);
  readonly filterText = signal('');
  readonly invert = signal(false);
  readonly types = signal<TypeChip[]>([]);
  readonly statuses = signal<StatusChip[]>([]);
  readonly includeDescendants = signal(true);
  readonly groupByClass = signal(false);
  readonly maskedHeaders = signal<string[]>(DEFAULT_MASKED_HEADERS);

  // Selection
  readonly selectedNodeId = signal<number | null>(null);
  readonly selectedRequestId = signal<string | null>(null);
  readonly collapsed = signal<ReadonlySet<number>>(new Set());

  readonly masker = computed(() => createMasker(this.maskedHeaders()));

  readonly selectedRequest = computed(() => this.requests().find((r) => r.id === this.selectedRequestId()) ?? null);
  readonly selectedNode = computed(() => this.tree().find((n) => n.id === this.selectedNodeId()) ?? null);

  /** Requests of the current page (Instance Ids are only meaningful within one page). */
  private readonly currentPageRequests = computed(() => {
    const prefix = `${this.pageId()}:`;
    return this.requests().filter((r) => r.id.startsWith(prefix));
  });

  private readonly children = computed(() => {
    const map = new Map<number | null, TreeNode[]>();
    for (const n of this.tree()) {
      const list = map.get(n.parentId) ?? [];
      list.push(n);
      map.set(n.parentId, list);
    }
    return map;
  });

  /** Request counts per Instance Id (own requests only). */
  private readonly ownCounts = computed(() => {
    const counts = new Map<number, number>();
    for (const r of this.currentPageRequests()) {
      const id = r.attribution.instanceId;
      if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  });

  readonly unattributedCount = computed(() => this.currentPageRequests().filter((r) => r.attribution.instanceId === null).length);

  /** Flattened, expanded tree rows for rendering. */
  readonly rows = computed<TreeRow[]>(() => {
    const rows: TreeRow[] = [];
    const children = this.children();
    const counts = this.ownCounts();
    const collapsed = this.collapsed();
    const walk = (parentId: number | null, depth: number) => {
      for (const node of children.get(parentId) ?? []) {
        const kids = children.get(node.id) ?? [];
        rows.push({ node, depth, count: counts.get(node.id) ?? 0, hasChildren: kids.length > 0 });
        if (!collapsed.has(node.id)) walk(node.id, depth + 1);
      }
    };
    walk(null, 0);
    return rows;
  });

  private descendantsOf(id: number): Set<number> {
    const result = new Set([id]);
    const children = this.children();
    const stack = [id];
    while (stack.length) {
      for (const c of children.get(stack.pop()!) ?? []) {
        result.add(c.id);
        stack.push(c.id);
      }
    }
    return result;
  }

  /** Requests in scope of the tree selection, before the filter bar. */
  readonly scopedRequests = computed(() => {
    const selected = this.selectedNodeId();
    if (selected === null) return this.requests();
    const page = this.currentPageRequests();
    if (selected === UNATTRIBUTED) return page.filter((r) => r.attribution.instanceId === null && r.attribution.className === null);
    const node = this.selectedNode();
    if (!node) return [];
    const ids = this.includeDescendants() ? this.descendantsOf(selected) : new Set([selected]);
    const classes = new Set(this.tree().filter((n) => ids.has(n.id)).map((n) => n.name));
    return page.filter((r) => {
      const a = r.attribution;
      if (a.instanceId !== null && ids.has(a.instanceId)) return true;
      // Group by class, or a stack match that could not pick one instance of the class.
      return a.className !== null && classes.has(a.className) && (this.groupByClass() || a.instanceId === null);
    });
  });

  readonly visibleRequests = computed(() => {
    const filter = createRequestFilter({
      text: this.filterText(),
      invert: this.invert(),
      types: this.types(),
      statuses: this.statuses(),
    });
    return this.scopedRequests().filter(filter);
  });

  private port: chrome.runtime.Port | null = null;

  connect(): void {
    if (this.tabId === null) return;
    const port = chrome.runtime.connect({ name: `panel:${this.tabId}` });
    this.port = port;
    this.connected.set(true);
    port.onMessage.addListener((m: HookMessage) => this.receive(m));
    port.onDisconnect.addListener(() => {
      this.connected.set(false);
      this.port = null;
      // The service worker was stopped: reconnect and resync.
      setTimeout(() => this.connect(), 250);
    });
    this.send({ type: 'get-snapshot' });
    this.send({ type: 'pause', paused: this.paused() });
  }

  send(command: PanelCommand): void {
    this.port?.postMessage(command);
  }

  receive(m: HookMessage): void {
    if (m.pageId !== this.pageId()) this.newPage(m.pageId);
    switch (m.type) {
      case 'snapshot':
        this.status.set(m.status);
        this.pageUrl.set(m.url);
        this.tree.set(m.tree);
        for (const r of m.requests) this.upsert(r);
        break;
      case 'status':
        this.status.set(m.status);
        break;
      case 'tree':
        this.tree.set(m.tree);
        break;
      case 'request':
        this.upsert(m.request);
        break;
      case 'inputs':
        this.inputs.set({ id: m.id, values: m.inputs });
        break;
      case 'picked':
        this.picking.set(false);
        this.selectNode(m.id);
        this.expandTo(m.id);
        break;
    }
  }

  private newPage(pageId: string): void {
    const first = this.pageId() === null;
    this.pageId.set(pageId);
    this.tree.set([]);
    this.inputs.set(null);
    this.selectedNodeId.set(null);
    if (!this.preserveLog()) {
      this.requests.set([]);
      this.selectedRequestId.set(null);
    }
    if (!first) {
      this.send({ type: 'get-snapshot' });
      // A reloaded page starts a fresh hook that records by default.
      if (this.paused()) this.send({ type: 'pause', paused: true });
    }
  }

  private upsert(r: CapturedRequest): void {
    this.requests.update((list) => {
      const i = list.findIndex((x) => x.id === r.id);
      if (i === -1) return [...list, r];
      const next = list.slice();
      next[i] = { ...r, enrichment: list[i].enrichment ?? r.enrichment };
      return next;
    });
  }

  /** Enrichment from chrome.devtools.network (ADR 4). */
  applyHarEntry(entry: HarLikeEntry): void {
    const enriched = enrich(this.requests(), entry);
    if (enriched) this.requests.update((list) => list.map((r) => (r.id === enriched.id ? enriched : r)));
  }

  selectNode(id: number | null): void {
    this.selectedNodeId.set(id);
    this.inputs.set(null);
    if (id !== null && id !== UNATTRIBUTED) this.send({ type: 'get-inputs', id });
  }

  selectRequest(r: CapturedRequest | null): void {
    this.selectedRequestId.set(r?.id ?? null);
    const owner = r?.attribution.instanceId ?? null;
    if (owner !== null && r!.id.startsWith(`${this.pageId()}:`)) {
      this.expandTo(owner);
      this.send({ type: 'highlight', id: owner });
    }
  }

  toggleCollapsed(id: number): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  expandTo(id: number): void {
    const byId = new Map(this.tree().map((n) => [n.id, n]));
    this.collapsed.update((set) => {
      const next = new Set(set);
      for (let n = byId.get(id); n && n.parentId !== null; n = byId.get(n.parentId)) next.delete(n.parentId);
      return next;
    });
  }

  clear(): void {
    this.requests.set([]);
    this.selectedRequestId.set(null);
    this.send({ type: 'clear' });
  }

  setPaused(paused: boolean): void {
    this.paused.set(paused);
    this.send({ type: 'pause', paused });
  }

  togglePick(): void {
    const on = !this.picking();
    this.picking.set(on);
    this.send({ type: 'pick', on });
  }

  toggleChip<T>(sig: { (): T[]; set(v: T[]): void }, chip: T): void {
    const list = sig();
    sig.set(list.includes(chip) ? list.filter((c) => c !== chip) : [...list, chip]);
  }
}

function resolveTabId(): number | null {
  const devtoolsTab = globalThis.chrome?.devtools?.inspectedWindow?.tabId;
  if (typeof devtoolsTab === 'number') return devtoolsTab;
  // Outside DevTools (e2e tests open the panel page directly): ?tabId=123
  const param = new URLSearchParams(location.search).get('tabId');
  return param === null ? null : Number(param);
}
