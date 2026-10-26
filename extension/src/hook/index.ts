/**
 * Main-world hook, injected at document_start (ADR 3). Captures requests into a page-side ring
 * buffer, attributes them to components, scans the component tree and answers panel commands.
 */
import {
  CONTENT_SOURCE,
  HOOK_SOURCE,
  RING_BUFFER_SIZE,
  type AngularStatus,
  type CapturedRequest,
  type HookMessage,
  type PanelCommand,
  type TreeNode,
  type WindowEnvelope,
} from '@ngapi/protocol';
import { attribute, type AttributionInput } from './attribution';
import { installCapture, type Recorder } from './capture';
import { OwnerContext } from './context';
import { Overlay } from './overlay';
import { InstanceRegistry } from './registry';
import { detectAngular, TreeScanner, type NgGlobals } from './tree';

/* eslint-disable @typescript-eslint/no-explicit-any */
const win = window as any;

if (!win.__ngapiHookInstalled) {
  win.__ngapiHookInstalled = true;
  start();
}

function start(): void {
  const setTimeoutNative = window.setTimeout.bind(window);
  const pageId = Math.random().toString(36).slice(2, 10);
  const registry = new InstanceRegistry();
  const context = new OwnerContext(registry);
  const scanner = new TreeScanner(registry);
  const overlay = new Overlay(document);

  const order: string[] = [];
  const requests = new Map<string, CapturedRequest>();
  /** Attribution inputs kept so unresolved requests can be re-attributed after later scans. */
  const pending = new Map<string, Omit<AttributionInput, 'registry'>>();
  let seq = 0;
  let paused = false;
  let status: AngularStatus = { kind: 'pending' };
  let tree: TreeNode[] = [];

  const post = (payload: HookMessage) => {
    const envelope: WindowEnvelope<HookMessage> = { source: HOOK_SOURCE, payload };
    window.postMessage(envelope, '*');
  };
  const ng = (): NgGlobals => win.ng ?? {};

  context.watchAngular(win);
  context.patchAsync(win);

  const recorder: Recorder = {
    start(transport, stack, request) {
      if (paused) return '';
      const id = `${pageId}:${++seq}`;
      const input = { stack, syncOwner: context.sync(), asyncOwner: context.asyncOwner, transport };
      const { attribution, httpClient } = attribute({ ...input, registry });
      const record: CapturedRequest = {
        id,
        transport,
        httpClient,
        ...request,
        status: null,
        statusText: '',
        error: null,
        responseHeaders: [],
        responseBody: { kind: 'none' },
        mime: null,
        startTime: Date.now(),
        endTime: null,
        attribution,
        enrichment: null,
      };
      if (needsRetry(record)) pending.set(id, input);
      requests.set(id, record);
      order.push(id);
      while (order.length > RING_BUFFER_SIZE) {
        const evicted = order.shift()!;
        requests.delete(evicted);
        pending.delete(evicted);
      }
      post({ type: 'request', pageId, request: record });
      return id;
    },
    update(id, patch) {
      const record = requests.get(id);
      if (!record) return;
      Object.assign(record, patch);
      post({ type: 'request', pageId, request: record });
    },
  };
  installCapture(win, recorder);

  const reattribute = () => {
    for (const [id, input] of pending) {
      const record = requests.get(id);
      if (!record) continue;
      const { attribution } = attribute({ ...input, registry });
      if (JSON.stringify(attribution) === JSON.stringify(record.attribution)) continue;
      record.attribution = attribution;
      if (!needsRetry(record)) pending.delete(id);
      post({ type: 'request', pageId, request: record });
    }
  };

  const scan = () => {
    if (status.kind !== 'dev') return;
    const next = scanner.scan(document, ng());
    if (JSON.stringify(next) !== JSON.stringify(tree)) {
      tree = next.map((n) => ({ ...n }));
      post({ type: 'tree', pageId, tree });
    }
    reattribute();
  };

  let scanQueued = false;
  const queueScan = () => {
    if (scanQueued) return;
    scanQueued = true;
    setTimeoutNative(() => {
      scanQueued = false;
      scan();
    }, 150);
  };

  const label = (id: number) => tree.find((n) => n.id === id)?.name ?? '';
  const handle = (command: PanelCommand) => {
    switch (command.type) {
      case 'get-snapshot':
        scan();
        post({
          type: 'snapshot',
          pageId,
          url: location.href,
          status,
          tree,
          requests: order.map((id) => requests.get(id)!),
        });
        break;
      case 'highlight':
        if (command.id === null) overlay.hide();
        else overlay.show(scanner.element(command.id), label(command.id));
        break;
      case 'pick':
        if (!command.on) overlay.cancelPick();
        else
          overlay.pick(
            (el) => scanner.ownerOf(el),
            label,
            (id) => scanner.element(id),
            (id) => post({ type: 'picked', pageId, id }),
          );
        break;
      case 'get-inputs':
        post({ type: 'inputs', pageId, id: command.id, inputs: scanner.inputs(command.id, ng()) });
        break;
      case 'clear':
        order.length = 0;
        requests.clear();
        pending.clear();
        scanner.dropGhosts();
        tree = [];
        scan();
        break;
      case 'pause':
        paused = command.paused;
        break;
    }
  };

  window.addEventListener('message', (event) => {
    const data = event.data as WindowEnvelope<PanelCommand> | undefined;
    if (event.source === window && data?.source === CONTENT_SOURCE) handle(data.payload);
  });

  const setStatus = (next: AngularStatus) => {
    if (JSON.stringify(next) === JSON.stringify(status)) return;
    status = next;
    post({ type: 'status', pageId, status });
    if (status.kind === 'dev') {
      new MutationObserver(queueScan).observe(document.documentElement, { childList: true, subtree: true });
      scan();
    }
  };

  // Detect Angular: poll until bootstrapped, give up after ~15 s.
  let attempts = 0;
  const detect = () => {
    const found = detectAngular(win);
    if (found.kind !== 'pending') return setStatus(found);
    if (++attempts > 50 && document.readyState === 'complete') return setStatus({ kind: 'not-angular' });
    setTimeoutNative(detect, 300);
  };
  post({ type: 'status', pageId, status });
  detect();
}

function needsRetry(r: CapturedRequest): boolean {
  return r.attribution.confidence === 'none' || (r.attribution.confidence === 'stack' && r.attribution.instanceId === null);
}
