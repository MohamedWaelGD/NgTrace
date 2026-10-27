import type { InterceptorStep } from './interceptors';
import type { MockRule } from './mock';
import type { SignalNode } from './signals';

/** Shared data model and message contracts between hook ↔ content ↔ background ↔ panel. */

export type AngularStatus =
  | { kind: 'pending' }
  | { kind: 'not-angular' }
  | { kind: 'production'; version: string | null }
  | { kind: 'dev'; version: string | null; zone: boolean };

export type Confidence = 'context' | 'stack' | 'none';

export interface Attribution {
  /** Instance Id of the Owner Component, when one instance could be identified. */
  instanceId: number | null;
  /** Class name of the Owner Component (also set when only the class is known). */
  className: string | null;
  confidence: Confidence;
  /** How the attribution was made, shown in the Initiator tab. */
  via: 'lifecycle' | 'listener' | 'async' | 'route' | 'stack' | 'resource' | 'none';
  /** Set when the request was sent while the router ran guards/resolvers, e.g. `stores/:id (resolve)`. */
  route: string | null;
  /** Owner Resource (ADR 9): the component's resource whose loader sent the request, e.g. `ProductDetailComponent.product` (dev builds). */
  ownerResource?: string;
  /** Owner Service: the innermost non-component app class in the Call Chain (the service that called HttpClient). */
  service: string | null;
  /** Outermost-first class names, ending with the transport (HttpClient / fetch / XMLHttpRequest). */
  callChain: string[];
  /** For Unattributed requests: the first app class in the Call Chain (service, effect, guard...). */
  group: string | null;
}

export type Body =
  | { kind: 'none' }
  | { kind: 'json'; text: string; size: number; truncated: boolean }
  | { kind: 'text'; text: string; size: number; truncated: boolean }
  | { kind: 'form'; entries: [string, string][]; size: number }
  | { kind: 'binary'; mime: string | null; size: number | null };

export type Header = [name: string, value: string];

/** One phase of a request's wire time, from the DevTools HAR entry. */
export interface TimingPhase {
  name: 'blocked' | 'dns' | 'connect' | 'send' | 'wait' | 'receive';
  ms: number;
}

export interface CapturedRequest {
  /** `${pageId}:${seq}` — unique across reloads. */
  id: string;
  transport: 'fetch' | 'xhr';
  httpClient: boolean;
  method: string;
  url: string;
  requestHeaders: Header[];
  requestBody: Body;
  status: number | null;
  statusText: string;
  /** Set when the request failed at network level (status 0, abort, CORS...). */
  error: string | null;
  responseHeaders: Header[];
  responseBody: Body;
  mime: string | null;
  /** Epoch ms. */
  startTime: number;
  /** Start as `performance.timeOrigin + performance.now()`: unaffected by wall-clock changes, used by the Timeline. */
  startMono?: number;
  endTime: number | null;
  attribution: Attribution;
  /** Set on a Replayed Request: the id of the Captured Request it was re-sent from. */
  replayOf?: string;
  /** Set when a Mock Rule answered (or failed) this request instead of the network. */
  mocked?: boolean;
  /** Set on a Retry: the id of the first attempt of its chain. */
  retryOf?: string;
  /** Attempt Number within a retry chain (1 for the first attempt), when the hook can tell. */
  attempt?: number;
  /** Set when an interceptor answered without calling `next` (e.g. from a cache): its name. Nothing reached the network. */
  shortCircuitedBy?: string;
  /** Interceptor Steps in chain order (dev builds); absent when the hook could not observe the chain. */
  interceptorSteps?: InterceptorStep[];
  /** Browser-level request headers from the DevTools HAR, once Enriched. */
  enrichment: { requestHeaders: Header[]; serverTiming?: number; phases?: TimingPhase[] } | null;
}

/** A router event shown as a Timeline marker. `at` uses the same monotonic epoch as `startMono`. */
export interface NavEvent {
  kind: 'start' | 'guards-start' | 'guards-end' | 'resolve-start' | 'resolve-end' | 'end' | 'cancel' | 'error';
  url: string;
  at: number;
}

/** A request the panel asks the hook to re-send (Replay / Edit & resend). */
export interface ReplaySpec {
  /** Id of the Captured Request this replays. */
  replayOf: string;
  method: string;
  url: string;
  headers: Header[];
  /** null: no body. */
  body: string | null;
}

export interface TreeNode {
  id: number;
  name: string;
  selector: string | null;
  parentId: number | null;
  /** Index of the Angular root this node belongs to. */
  root: number;
  destroyed: boolean;
  /** Workspace-relative source file from `ɵcmp.debugInfo` (dev builds only). */
  filePath?: string;
  /** 1-based line of the class declaration in `filePath`. */
  lineNumber?: number;
}

export interface InputValue {
  name: string;
  preview: string;
}

/** One property in the State / service state explorer. */
export interface ValueEntry {
  name: string;
  preview: string;
  expandable: boolean;
}

/** Whose value tree to read: a component instance, or a service instance seen by the hook. */
export type ValueTarget = { kind: 'component'; id: number } | { kind: 'service'; id: number };

export interface InjectedService {
  name: string;
  /** Hook-side id for reading its state; null when the value is not an object. */
  serviceId: number | null;
  /** Label of the injector that supplied it, e.g. `Route: stores/:id`, `root`, `<app-shop>`. */
  from: string;
  framework: boolean;
}

export interface ProviderInfo {
  name: string;
  /** Set when the instance already exists (never created just to look at it). */
  serviceId: number | null;
  /** null when the injector cannot tell. */
  created: boolean | null;
  framework: boolean;
}

export interface InjectorLevel {
  label: string;
  kind: 'element' | 'environment' | 'null';
  providers: ProviderInfo[];
}

export interface ComponentDetails {
  id: number;
  inputs: InputValue[];
  state: ValueEntry[];
  /** Empty when the Angular version lacks the DI debug APIs. */
  services: InjectedService[];
  injectorPath: InjectorLevel[];
  /** False when `ng.ɵgetDependenciesFromInjectable` and friends are unavailable (older Angular). */
  diSupported: boolean;
  /** Signal graph of the component (template and effects); null without `ng.ɵgetSignalGraph` (production builds). */
  signals?: SignalNode[] | null;
}

/** Live Values update (ADR 5): only the lists that changed since the last read are present. */
export interface LiveUpdate {
  target: ValueTarget;
  /** When the values were read, on the monotonic clock of `startMono` (for Value History). */
  at?: number;
  /** Component @Inputs; absent when unchanged or for a service target. */
  inputs?: InputValue[];
  /** Expanded value lists that changed, including the root (path []). */
  lists: { path: string[]; entries: ValueEntry[] }[];
  /** Changed rows: input names, and value paths (list path + entry name). */
  changedInputs: string[];
  changedPaths: string[][];
  /** The component's signal graph; absent when unchanged or unavailable. */
  signals?: SignalNode[];
  /** Ids of signal nodes whose value or dependencies changed. */
  changedSignals?: string[];
  /** True while reads are slow and the interval has backed off. */
  throttled: boolean;
}

/** Messages the page hook sends towards the panel. */
export type HookMessage =
  | { type: 'snapshot'; pageId: string; url: string; status: AngularStatus; tree: TreeNode[]; requests: CapturedRequest[]; navigation: NavEvent[] }
  | { type: 'status'; pageId: string; status: AngularStatus }
  | { type: 'tree'; pageId: string; tree: TreeNode[] }
  | { type: 'request'; pageId: string; request: CapturedRequest }
  | { type: 'navigation'; pageId: string; event: NavEvent }
  /** A Mock Rule problem the user should know about, e.g. requests were sent before the rules arrived. */
  | { type: 'mock-warning'; pageId: string; message: string }
  | { type: 'details'; pageId: string; details: ComponentDetails }
  | { type: 'expanded'; pageId: string; target: ValueTarget; path: string[]; entries: ValueEntry[] }
  | { type: 'picked'; pageId: string; id: number; element: string }
  /** Answer to `reveal`: the host element is exposed for `inspect()`, or the instance is gone. */
  | { type: 'revealed'; pageId: string; id: number; ok: boolean }
  | { type: 'live'; pageId: string; update: LiveUpdate };

/** Messages the panel sends to the page hook. */
export type PanelCommand =
  | { type: 'get-snapshot' }
  | { type: 'highlight'; id: number | null }
  | { type: 'pick'; on: boolean }
  | { type: 'get-details'; id: number }
  /** Reveal in Elements: expose this instance's host element as `window.__ngtrace_reveal`. */
  | { type: 'reveal'; id: number }
  | { type: 'expand'; target: ValueTarget; path: string[] }
  | { type: 'clear' }
  | { type: 'replay'; spec: ReplaySpec }
  /** Arms these Mock Rules for as long as the panel keeps sending them (ADR 8); sent again as a heartbeat. */
  | { type: 'mock-rules'; rules: MockRule[] }
  | { type: 'mock-disarm' }
  | { type: 'pause'; paused: boolean }
  /** Live Values: follow this target and these expanded paths (always includes the root); null stops. */
  | { type: 'live-target'; target: ValueTarget | null; paths: string[][] };

/** window.postMessage envelope between the main-world hook and the content script. */
export const HOOK_SOURCE = '__ngtrace_hook__';
export const CONTENT_SOURCE = '__ngtrace_content__';
export interface WindowEnvelope<T> {
  source: typeof HOOK_SOURCE | typeof CONTENT_SOURCE;
  payload: T;
}

/** Runtime messages between content script / background / panel. */
export type RuntimeMessage =
  | { channel: 'hook'; message: HookMessage }
  | { channel: 'command'; tabId: number; command: PanelCommand };

export const DEFAULT_MASKED_HEADERS = ['authorization', 'cookie', 'set-cookie', 'proxy-authorization'];
export const DEFAULT_MASK_PATTERN = /token|secret|api[-_]?key/i;
export const MAX_BODY_BYTES = 1024 * 1024;
export const RING_BUFFER_SIZE = 1000;
