import type { Header } from './types';

/** Interceptor Steps (ADR 10): what each interceptor changed in the request it passed on. */

/** A serialisable view of an Angular HttpRequest. */
export interface RequestSnapshot {
  method: string;
  /** Without the HttpParams (those are in `params`). */
  url: string;
  params: [string, string][];
  headers: Header[];
  /** Short serialised body; null when there is none. */
  body: string | null;
  /** The body object itself, to notice a replaced body that serialises the same. Hook-side only: never posted. */
  bodyRef?: unknown;
}

export interface HeaderChange {
  name: string;
  before: string;
  after: string;
}

export interface FieldChange {
  field: 'method' | 'url' | 'params' | 'body';
  before: string;
  after: string;
}

export interface RequestDiff {
  added: Header[];
  removed: Header[];
  changed: HeaderChange[];
  fields: FieldChange[];
}

export interface InterceptorStep {
  /** Function or class name; "anonymous" for inline arrow interceptors (and in production builds). */
  name: string;
  kind: 'functional' | 'class';
  /** Changes between the request it received and the one it passed to `next`; null when it never called `next`. */
  diff: RequestDiff | null;
  /** It returned without calling `next` (e.g. answered from a cache). */
  shortCircuit: boolean;
  /** Re-subscriptions of `next` after an error (Retries it started). */
  retries: number;
}

export function diffRequests(before: RequestSnapshot, after: RequestSnapshot): RequestDiff {
  const diff: RequestDiff = { added: [], removed: [], changed: [], fields: [] };
  const old = new Map(before.headers.map(([n, v]) => [n.toLowerCase(), [n, v] as Header]));
  for (const [name, value] of after.headers) {
    const prev = old.get(name.toLowerCase());
    if (!prev) diff.added.push([name, value]);
    else if (prev[1] !== value) diff.changed.push({ name, before: prev[1], after: value });
    old.delete(name.toLowerCase());
  }
  diff.removed = [...old.values()];

  const field = (name: FieldChange['field'], a: string, b: string) => {
    if (a !== b) diff.fields.push({ field: name, before: a, after: b });
  };
  field('method', before.method, after.method);
  field('url', before.url, after.url);
  field('params', paramsText(before.params), paramsText(after.params));
  const bodyText = (s: RequestSnapshot) => s.body ?? '';
  if (bodyText(before) !== bodyText(after) || before.bodyRef !== after.bodyRef) {
    diff.fields.push({ field: 'body', before: bodyText(before), after: bodyText(after) });
  }
  return diff;
}

export function isEmptyDiff(diff: RequestDiff): boolean {
  return !diff.added.length && !diff.removed.length && !diff.changed.length && !diff.fields.length;
}

function paramsText(params: [string, string][]): string {
  return params.map(([k, v]) => `${k}=${v}`).join('&');
}
