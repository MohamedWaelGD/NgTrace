import { computed, effect, Injectable, signal, untracked } from '@angular/core';
import {
  createMasker,
  bodyText,
  createRequestFilter,
  DEFAULT_MASKED_HEADERS,
  DEFAULT_DUPLICATE_WINDOW_MS,
  DEFAULT_QUICK_COPY_HEADERS,
  EDITOR_SETTINGS_PREFIX,
  REVEAL_GLOBAL,
  detectWaste,
  groupReplays,
  historyKey,
  isFailed,
  ValueHistory,
  retryChains,
  summariseFailures,
  matchRule,
  type MockRule,
  type ReplaySpec,
  summariseWaste,
  enrich,
  type AngularStatus,
  type CapturedRequest,
  type ComponentDetails,
  type EditorSettings,
  type HarLikeEntry,
  type HookMessage,
  type LiveUpdate,
  type NavEvent,
  type PanelCommand,
  type StatusChip,
  type TreeNode,
  type TypeChip,
  type ValueEntry,
  type SortDirection,
  type ValueTarget,
} from '@ngtrace/protocol';
import { inspectedEval } from './devtools';

/** Request table columns that can be sorted. */
export type SortColumn = 'name' | 'method' | 'status' | 'type' | 'component' | 'size' | 'time' | 'timestamp';

/** Virtual tree selection for requests without an Owner Component. */
export const UNATTRIBUTED = -1;

export interface SelectedService {
  name: string;
  serviceId: number | null;
}

export const targetKey = (t: ValueTarget, path: string[]) => [t.kind, t.id, ...path].join('\u0000');

export interface TreeRow {
  node: TreeNode;
  depth: number;
  count: number;
  /** Failed Requests among its own requests. */
  failed: number;
  /** Owner Resources of this instance with their request counts (dev builds). */
  resources: { name: string; count: number }[];
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
  readonly details = signal<ComponentDetails | null>(null);
  /** Expanded value-tree children, keyed by targetKey(). */
  readonly expansions = signal<ReadonlyMap<string, ValueEntry[]>>(new Map());

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
  /** Also show requests that no component started, made by services the selected component injects. */
  readonly includeServices = signal(true);
  readonly showFramework = signal(false);
  readonly maskedHeaders = signal<string[]>(DEFAULT_MASKED_HEADERS);
  readonly quickCopyHeaders = signal<string[]>(DEFAULT_QUICK_COPY_HEADERS);
  readonly duplicateWindowMs = signal(DEFAULT_DUPLICATE_WINDOW_MS);
  /** Alternating row backgrounds in the request table and the component tree (extension option). */
  readonly stripedRows = signal(true);
  /** Request table sort; null keeps capture order. */
  readonly sort = signal<{ key: SortColumn; direction: SortDirection } | null>(null);
  /** Show only requests flagged with a Waste Signal. */
  readonly wasteOnly = signal(false);
  /** Skip the confirmation before replaying side-effecting requests (this session only, never saved). */
  readonly skipReplayConfirm = signal(false);
  readonly showWasteSummary = signal(false);
  /** Show only Failed Requests (table and Timeline). */
  readonly failedOnly = signal(false);
  readonly showFailureSummary = signal(false);
  readonly viewMode = signal<'table' | 'timeline'>('table');

  // Mock Rules (ADR 8): saved per origin, armed in the hook only while this panel keeps sending them.
  readonly mockRules = signal<MockRule[]>([]);
  readonly showMocks = signal(false);
  readonly mockWarning = signal<string | null>(null);
  private mocksLoaded = false;
  readonly activeMocks = computed(() => this.mockRules().filter((r) => r.enabled).length);

  /** Component classes seen in this panel session (tree or requests), kept across reloads; for autocomplete. */
  private readonly seenComponents = signal<ReadonlySet<string>>(new Set());
  readonly knownComponents = computed(() => [...this.seenComponents()].sort((a, b) => a.localeCompare(b)));

  /** How many captured requests each Mock Rule would match, so users can see whether a rule is hitting. */
  readonly ruleMatches = computed(() => {
    const requests = this.requests();
    const counts = new Map<string, number>();
    for (const rule of this.mockRules()) {
      const only = [{ ...rule, enabled: true }];
      counts.set(
        rule.id,
        requests.filter((r) => matchRule(only, { method: r.method, url: r.url, className: r.attribution.className })).length,
      );
    }
    return counts;
  });

  /** "Open in editor" settings for the inspected page's origin (extension options). */
  readonly editorSettings = signal<EditorSettings>({});

  private noteComponents(names: (string | null)[]): void {
    const fresh = names.filter((n): n is string => !!n && !this.seenComponents().has(n));
    if (fresh.length) this.seenComponents.update((set) => new Set([...set, ...fresh]));
  }
  /** Router events for the Timeline markers (same monotonic epoch as request starts). */
  readonly navigation = signal<NavEvent[]>([]);

  // Selection
  readonly selectedNodeId = signal<number | null>(null);
  readonly selectedRequestId = signal<string | null>(null);
  readonly selectedService = signal<SelectedService | null>(null);
  readonly collapsed = signal<ReadonlySet<number>>(new Set());

  // Live Values (ADR 5)
  /** Rows that just changed: `input <name>` or targetKey(target, path); cleared after the flash. */
  readonly flashing = signal<ReadonlySet<string>>(new Set());
  readonly liveThrottled = signal(false);
  /** The element the picker last selected, shown on its tree row until the next selection. */
  readonly pickedElement = signal<{ id: number; element: string } | null>(null);
  /** Bumped when the tree should scroll the selected row into view. */
  readonly revealSelected = signal(0);

  /** What Live Values follow: the selected service, else the selected component (once its details arrived). */
  readonly liveTarget = computed<ValueTarget | null>(
    () => {
      const service = this.selectedService();
      if (service) return service.serviceId === null ? null : { kind: 'service', id: service.serviceId };
      const details = this.details();
      return details && details.id === this.selectedNodeId() ? { kind: 'component', id: details.id } : null;
    },
    { equal: (a, b) => a?.kind === b?.kind && a?.id === b?.id },
  );

  // Value History: kept from the Live Values updates of the target, frozen while Recording is paused.
  private history: ValueHistory | null = null;
  /** Bumped whenever the history changes (it is a mutable buffer). */
  private readonly historyVersion = signal(0);
  /** Snapshot being viewed; null while live. */
  readonly historyIndex = signal<number | null>(null);

  /** Snapshot times and length of the target's history, for the scrubber. */
  readonly historyTimes = computed(() => {
    this.historyVersion();
    return this.history?.times() ?? [];
  });

  /** The snapshot being viewed, or null while live. */
  readonly historySnapshot = computed(() => {
    this.historyVersion();
    const index = this.historyIndex();
    return index === null || !this.history ? null : (this.history.at(index) ?? null);
  });

  /** Captured Requests of the target (owned by the component, or sent by the service), as scrubber markers. */
  readonly historyMarkers = computed(() => {
    const target = this.liveTarget();
    if (!target) return [];
    const service = this.selectedService();
    return this.currentPageRequests().filter(
      (r) =>
        r.startMono !== undefined &&
        (target.kind === 'component' ? r.attribution.instanceId === target.id : r.attribution.service === service?.name),
    );
  });

  /** Component details as shown: the viewed snapshot's values while scrubbing. */
  readonly viewDetails = computed(() => {
    const details = this.details();
    const snapshot = this.historySnapshot();
    if (!details || !snapshot) return details;
    return {
      ...details,
      inputs: snapshot.inputs,
      state: snapshot.lists[historyKey.path([])] ?? details.state,
      signals: snapshot.signals ?? details.signals,
    };
  });

  /** Expanded value lists as shown: the viewed snapshot's lists over the current ones. */
  readonly viewExpansions = computed<ReadonlyMap<string, ValueEntry[]>>(() => {
    const snapshot = this.historySnapshot();
    const target = this.liveTarget();
    if (!snapshot || !target) return this.expansions();
    const map = new Map(this.expansions());
    for (const [key, entries] of Object.entries(snapshot.lists)) {
      const path = JSON.parse(key.slice(key.indexOf('\u0000') + 1)) as string[];
      const k = targetKey(target, path);
      if (map.has(k) || (!path.length && target.kind === 'service')) map.set(k, entries);
    }
    return map;
  });

  /** Rows highlighted as changed: live flashes, or what changed at the viewed step. */
  readonly viewFlashing = computed<ReadonlySet<string>>(() => {
    const snapshot = this.historySnapshot();
    const target = this.liveTarget();
    if (!snapshot || !target) return this.flashing();
    return new Set(
      snapshot.changed.map((key) => {
        const [kind, rest] = [key.slice(0, key.indexOf('\u0000')), key.slice(key.indexOf('\u0000') + 1)];
        if (kind === 'input') return `input ${rest}`;
        if (kind === 'signal') return `signal ${rest}`;
        return targetKey(target, JSON.parse(rest) as string[]);
      }),
    );
  });

  /** Expanded value paths of the Live Values target. */
  private readonly livePaths = computed(
    () => {
      const target = this.liveTarget();
      if (!target) return [];
      const root = targetKey(target, []);
      return [...this.expansions().keys()]
        .filter((k) => k === root || k.startsWith(`${root}\u0000`))
        .map((k) => k.split('\u0000').slice(2));
    },
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );

  readonly masker = computed(() => createMasker(this.maskedHeaders()));

  /** Waste Signals per request id, over everything the panel holds. */
  readonly waste = computed(() => detectWaste(this.requests(), this.duplicateWindowMs()));
  readonly wasteSummary = computed(() => summariseWaste(this.requests(), this.waste()));
  /** Retry chains keyed by every attempt's id. */
  readonly retryChains = computed(() => retryChains(this.requests()));
  readonly failureSummary = computed(() => summariseFailures(this.requests()));

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

  /** Request and Failed Request counts per Instance Id (own requests only). */
  private readonly ownCounts = computed(() => {
    const counts = new Map<number, { all: number; failed: number }>();
    for (const r of this.currentPageRequests()) {
      const id = r.attribution.instanceId;
      if (id === null) continue;
      const c = counts.get(id) ?? { all: 0, failed: 0 };
      c.all++;
      if (isFailed(r)) c.failed++;
      counts.set(id, c);
    }
    return counts;
  });

  /** Request counts per Owner Resource, per Instance Id. */
  private readonly resourceCounts = computed(() => {
    const byInstance = new Map<number, Map<string, number>>();
    for (const r of this.currentPageRequests()) {
      const { instanceId, ownerResource } = r.attribution;
      if (instanceId === null || !ownerResource) continue;
      const counts = byInstance.get(instanceId) ?? new Map<string, number>();
      counts.set(ownerResource, (counts.get(ownerResource) ?? 0) + 1);
      byInstance.set(instanceId, counts);
    }
    return byInstance;
  });

  /** Requests per Owner Service on the current page. */
  readonly serviceCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const r of this.currentPageRequests()) {
      const s = r.attribution.service;
      if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return counts;
  });

  readonly unattributedCount = computed(() => this.currentPageRequests().filter((r) => r.attribution.instanceId === null).length);

  /** Flattened, expanded tree rows for rendering. */
  readonly rows = computed<TreeRow[]>(() => {
    const rows: TreeRow[] = [];
    const children = this.children();
    const counts = this.ownCounts();
    const resources = this.resourceCounts();
    const collapsed = this.collapsed();
    const walk = (parentId: number | null, depth: number) => {
      for (const node of children.get(parentId) ?? []) {
        const kids = children.get(node.id) ?? [];
        const c = counts.get(node.id);
        const owned = [...(resources.get(node.id) ?? [])].map(([name, count]) => ({ name, count }));
        rows.push({ node, depth, count: c?.all ?? 0, failed: c?.failed ?? 0, resources: owned, hasChildren: kids.length > 0 });
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
    const service = this.selectedService();
    const page = this.currentPageRequests();
    if (service) return page.filter((r) => r.attribution.service === service.name);
    const selected = this.selectedNodeId();
    if (selected === null) return this.requests();
    if (selected === UNATTRIBUTED) return page.filter((r) => r.attribution.instanceId === null && r.attribution.className === null);
    const node = this.selectedNode();
    if (!node) return [];
    const ids = this.includeDescendants() ? this.descendantsOf(selected) : new Set([selected]);
    const classes = new Set(this.tree().filter((n) => ids.has(n.id)).map((n) => n.name));
    const details = this.details();
    const injected =
      this.includeServices() && details?.id === selected ? new Set(details.services.map((s) => s.name)) : new Set<string>();
    return page.filter((r) => {
      const a = r.attribution;
      if (a.instanceId !== null && ids.has(a.instanceId)) return true;
      // Only requests no component started: a shared service's calls from other components stay with them.
      if (a.className === null && a.service !== null && injected.has(a.service)) return true;
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
    const waste = this.waste();
    const wasteOnly = this.wasteOnly();
    const failedOnly = this.failedOnly();
    return groupReplays(this.scopedRequests().filter((r) => filter(r) && (!wasteOnly || waste.has(r.id)) && (!failedOnly || isFailed(r))));
  });

  private port: chrome.runtime.Port | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => this.send({ type: 'live-target', target: this.liveTarget(), paths: this.livePaths() }));
    // A new Live Values target starts a new Value History from the values shown now.
    effect(() => {
      const target = this.liveTarget();
      untracked(() => this.startHistory(target));
    });
    effect(() => {
      const origin = originOf(this.pageUrl());
      if (origin) void this.loadMockRules(origin);
    });
    effect(() => {
      const rules = this.mockRules();
      if (!this.mocksLoaded) return;
      const origin = originOf(untracked(() => this.pageUrl()));
      if (origin) void chrome.storage?.local.set({ [MOCKS_KEY + origin]: rules });
      this.armMocks();
    });
    effect(() => {
      const origin = originOf(this.pageUrl());
      if (origin) void this.loadEditorSettings(origin);
    });
    chrome.storage?.onChanged.addListener((changes) => {
      const origin = originOf(untracked(() => this.pageUrl()));
      if (origin && changes[EDITOR_SETTINGS_PREFIX + origin]) void this.loadEditorSettings(origin);
    });
    // The hook drops the rules when these stop arriving (the panel closed).
    setInterval(() => this.armMocks(), MOCK_HEARTBEAT_MS);
  }

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
    this.armMocks();
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
        this.noteComponents(m.tree.map((n) => n.name));
        for (const r of m.requests) this.upsert(r);
        for (const e of m.navigation) this.addNavigation(e);
        break;
      case 'status':
        this.status.set(m.status);
        break;
      case 'tree':
        this.tree.set(m.tree);
        this.noteComponents(m.tree.map((n) => n.name));
        break;
      case 'request':
        this.upsert(m.request);
        break;
      case 'navigation':
        this.addNavigation(m.event);
        break;
      case 'mock-warning':
        this.mockWarning.set(m.message);
        break;
      case 'details':
        if (m.details.id === this.selectedNodeId()) this.details.set(m.details);
        break;
      case 'expanded': {
        const key = targetKey(m.target, m.path);
        this.expansions.update((map) => new Map(map).set(key, m.entries));
        break;
      }
      case 'picked':
        this.picking.set(false);
        this.selectNode(m.id);
        this.expandTo(m.id);
        this.pickedElement.set({ id: m.id, element: m.element });
        this.revealSelected.update((n) => n + 1);
        break;
      case 'live':
        this.applyLive(m.update);
        break;
      case 'revealed':
        // Selects the element in the Elements panel (the Console's command-line API).
        if (m.ok) inspectedEval(`inspect(window.${REVEAL_GLOBAL})`);
        break;
    }
  }

  private startHistory(target: ValueTarget | null): void {
    this.historyIndex.set(null);
    this.history = null;
    if (target) {
      const details = this.details();
      const root = target.kind === 'component' ? (details?.state ?? []) : (this.expansions().get(targetKey(target, [])) ?? []);
      this.history = new ValueHistory(target, {
        // The panel's clock: close to the page's monotonic epoch, and only used for the first snapshot.
        at: performance.timeOrigin + performance.now(),
        inputs: target.kind === 'component' ? (details?.inputs ?? []) : [],
        lists: [{ path: [], entries: root }],
        signals: target.kind === 'component' ? (details?.signals ?? null) : null,
      });
    }
    this.historyVersion.update((v) => v + 1);
  }

  /** Scrubs the Value History; null goes back to live values. Recording keeps going. */
  viewHistory(index: number | null): void {
    const last = (this.history?.length ?? 1) - 1;
    this.historyIndex.set(index === null || index >= last ? null : Math.max(0, index));
  }

  private applyLive(u: LiveUpdate): void {
    const target = this.liveTarget();
    if (!target || target.kind !== u.target.kind || target.id !== u.target.id) return;
    if (this.history && !this.paused()) {
      this.history.apply(u);
      this.historyVersion.update((v) => v + 1);
    }
    this.liveThrottled.set(u.throttled);
    const details = this.details();
    if (target.kind === 'component' && details) {
      const root = u.lists.find((l) => !l.path.length);
      this.details.set({
        ...details,
        inputs: u.inputs ?? details.inputs,
        state: root?.entries ?? details.state,
        signals: u.signals ?? details.signals,
      });
    }
    this.expansions.update((map) => {
      const next = new Map(map);
      for (const list of u.lists) {
        const key = targetKey(target, list.path);
        // Component root state lives in details; other lists only while still expanded.
        if (next.has(key) || (target.kind === 'service' && !list.path.length)) next.set(key, list.entries);
      }
      return next;
    });
    const keys = [
      ...u.changedInputs.map((n) => `input ${n}`),
      ...u.changedPaths.map((p) => targetKey(target, p)),
      ...(u.changedSignals ?? []).map((id) => `signal ${id}`),
    ];
    if (!keys.length) return;
    this.flashing.set(new Set(keys));
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.flashing.set(new Set()), 600);
  }

  private newPage(pageId: string): void {
    const first = this.pageId() === null;
    this.pageId.set(pageId);
    this.tree.set([]);
    this.details.set(null);
    this.selectedService.set(null);
    this.expansions.set(new Map());
    this.selectedNodeId.set(null);
    if (!this.preserveLog()) {
      this.navigation.set([]);
      this.requests.set([]);
      this.selectedRequestId.set(null);
    }
    this.mockWarning.set(null);
    this.armMocks();
    if (!first) {
      this.send({ type: 'get-snapshot' });
      // A reloaded page starts a fresh hook that records by default.
      if (this.paused()) this.send({ type: 'pause', paused: true });
    }
  }

  private addNavigation(e: NavEvent): void {
    this.navigation.update((list) => (list.some((x) => x.at === e.at && x.kind === e.kind && x.url === e.url) ? list : [...list, e]));
  }

  private upsert(r: CapturedRequest): void {
    this.noteComponents([r.attribution.className]);
    this.requests.update((list) => {
      const i = list.findIndex((x) => x.id === r.id);
      if (i === -1) return [...list, r];
      const next = list.slice();
      next[i] = { ...r, enrichment: list[i].enrichment ?? r.enrichment };
      return next;
    });
  }

  private async loadEditorSettings(origin: string): Promise<void> {
    const stored = await chrome.storage?.sync.get(EDITOR_SETTINGS_PREFIX + origin);
    const settings = stored?.[EDITOR_SETTINGS_PREFIX + origin];
    this.editorSettings.set(settings && typeof settings === 'object' ? (settings as EditorSettings) : {});
  }

  /** Reveal in Elements: the hook exposes the host element, then `revealed` selects it. */
  reveal(id: number): void {
    this.send({ type: 'reveal', id });
  }

  nodeById(id: number | null): TreeNode | null {
    return id === null ? null : (this.tree().find((n) => n.id === id) ?? null);
  }

  private async loadMockRules(origin: string): Promise<void> {
    this.mocksLoaded = false;
    const stored = await chrome.storage?.local.get(MOCKS_KEY + origin);
    const rules = stored?.[MOCKS_KEY + origin];
    this.mockRules.set(Array.isArray(rules) ? (rules as MockRule[]) : []);
    this.mocksLoaded = true;
    this.armMocks();
  }

  /** Tells the hook which rules to apply; repeated as a heartbeat so closing the panel disarms them. */
  armMocks(): void {
    if (this.mocksLoaded) this.send({ type: 'mock-rules', rules: this.mockRules() });
  }

  addMockRule(rule: Partial<MockRule> = {}): void {
    const created: MockRule = {
      id: crypto.randomUUID(),
      enabled: true,
      method: '*',
      pattern: '',
      regex: false,
      component: null,
      delayMs: 0,
      action: { kind: 'respond', status: 200, headers: [['Content-Type', 'application/json']], body: '{}' },
      ...rule,
    };
    this.mockRules.update((list) => [...list, created]);
  }

  updateMockRule(id: string, patch: Partial<MockRule>): void {
    this.mockRules.update((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  removeMockRule(id: string): void {
    this.mockRules.update((list) => list.filter((r) => r.id !== id));
  }

  moveMockRule(id: string, delta: -1 | 1): void {
    this.mockRules.update((list) => {
      const i = list.findIndex((r) => r.id === id);
      const j = i + delta;
      if (i === -1 || j < 0 || j >= list.length) return list;
      const next = list.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  /** "Mock this request…": a rule for this request's method, path and Owner Component, prefilled with its response. */
  mockFrom(r: CapturedRequest): void {
    let pattern = r.url;
    try {
      pattern = new URL(r.url).pathname;
    } catch {
      // keep the URL as is
    }
    const contentType = r.responseHeaders.find(([n]) => n.toLowerCase() === 'content-type');
    this.addMockRule({
      method: r.method,
      pattern,
      component: r.attribution.className,
      action: {
        kind: 'respond',
        status: r.status ?? 200,
        headers: contentType ? [contentType] : [['Content-Type', 'application/json']],
        body: bodyText(r.responseBody) ?? '',
      },
    });
    this.showMocks.set(true);
  }

  /** Enrichment from chrome.devtools.network (ADR 4). */
  applyHarEntry(entry: HarLikeEntry): void {
    const enriched = enrich(this.requests(), entry);
    if (enriched) this.requests.update((list) => list.map((r) => (r.id === enriched.id ? enriched : r)));
  }

  selectNode(id: number | null): void {
    this.selectedNodeId.set(id);
    this.pickedElement.set(null);
    this.liveThrottled.set(false);
    this.selectedService.set(null);
    this.details.set(null);
    this.expansions.set(new Map());
    if (id !== null && id !== UNATTRIBUTED) this.send({ type: 'get-details', id });
  }

  /** Shows the requests made by a service (and its state, when the instance exists). */
  selectService(service: SelectedService | null): void {
    this.selectedService.set(service);
    if (service?.serviceId != null) this.expand({ kind: 'service', id: service.serviceId }, []);
  }

  expand(target: ValueTarget, path: string[]): void {
    this.send({ type: 'expand', target, path });
  }

  collapse(target: ValueTarget, path: string[]): void {
    const key = targetKey(target, path);
    this.expansions.update((map) => {
      const next = new Map(map);
      next.delete(key);
      return next;
    });
  }

  selectRequest(r: CapturedRequest | null): void {
    this.selectedRequestId.set(r?.id ?? null);
    // A request of the Live Values target: show the values just before it was sent.
    // By id: the row may hold an older copy of the request than the store (upserts replace it).
    if (r && this.history && r.startMono !== undefined && this.historyMarkers().some((m) => m.id === r.id)) {
      this.viewHistory(Math.max(0, this.history.before(r.startMono)));
    }
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
    this.navigation.set([]);
    this.requests.set([]);
    this.selectedRequestId.set(null);
    this.send({ type: 'clear' });
  }

  /** Confirmation for a header copy: header copies are raw (ADR 6), so say when the header is masked on screen. */
  headerCopyLabel(header: string, what = header): string {
    return this.masker().isMasked(header) ? what + ' (unmasked)' : what;
  }

  setPaused(paused: boolean): void {
    this.paused.set(paused);
    this.send({ type: 'pause', paused });
  }

  replay(spec: ReplaySpec): void {
    this.send({ type: 'replay', spec });
  }

  togglePick(): void {
    const on = !this.picking();
    this.picking.set(on);
    this.send({ type: 'pick', on });
  }

  /** Narrows the table to one Owner Resource (the `resource:` filter). */
  filterByResource(name: string): void {
    const rest = this.filterText()
      .split(/\s+/)
      .filter((t) => t && !/^-?resource:/i.test(t));
    this.filterText.set([...rest, `resource:${name}`].join(' '));
  }

  toggleChip<T>(sig: { (): T[]; set(v: T[]): void }, chip: T): void {
    const list = sig();
    sig.set(list.includes(chip) ? list.filter((c) => c !== chip) : [...list, chip]);
  }
}

const MOCKS_KEY = 'mocks:';
const MOCK_HEARTBEAT_MS = 5000;

export function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function resolveTabId(): number | null {
  const devtoolsTab = globalThis.chrome?.devtools?.inspectedWindow?.tabId;
  if (typeof devtoolsTab === 'number') return devtoolsTab;
  // Outside DevTools (e2e tests open the panel page directly): ?tabId=123
  const param = new URLSearchParams(location.search).get('tabId');
  return param === null ? null : Number(param);
}
