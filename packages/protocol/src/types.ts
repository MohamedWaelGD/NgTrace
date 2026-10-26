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
  via: 'lifecycle' | 'listener' | 'async' | 'route' | 'stack' | 'none';
  /** Set when the request was sent while the router ran guards/resolvers, e.g. `stores/:id (resolve)`. */
  route: string | null;
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
  endTime: number | null;
  attribution: Attribution;
  /** Browser-level request headers from the DevTools HAR, once Enriched. */
  enrichment: { requestHeaders: Header[]; serverTiming?: number } | null;
}

export interface TreeNode {
  id: number;
  name: string;
  selector: string | null;
  parentId: number | null;
  /** Index of the Angular root this node belongs to. */
  root: number;
  destroyed: boolean;
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
}

/** Messages the page hook sends towards the panel. */
export type HookMessage =
  | { type: 'snapshot'; pageId: string; url: string; status: AngularStatus; tree: TreeNode[]; requests: CapturedRequest[] }
  | { type: 'status'; pageId: string; status: AngularStatus }
  | { type: 'tree'; pageId: string; tree: TreeNode[] }
  | { type: 'request'; pageId: string; request: CapturedRequest }
  | { type: 'details'; pageId: string; details: ComponentDetails }
  | { type: 'expanded'; pageId: string; target: ValueTarget; path: string[]; entries: ValueEntry[] }
  | { type: 'picked'; pageId: string; id: number };

/** Messages the panel sends to the page hook. */
export type PanelCommand =
  | { type: 'get-snapshot' }
  | { type: 'highlight'; id: number | null }
  | { type: 'pick'; on: boolean }
  | { type: 'get-details'; id: number }
  | { type: 'expand'; target: ValueTarget; path: string[] }
  | { type: 'clear' }
  | { type: 'pause'; paused: boolean };

/** window.postMessage envelope between the main-world hook and the content script. */
export const HOOK_SOURCE = '__ngapi_hook__';
export const CONTENT_SOURCE = '__ngapi_content__';
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
