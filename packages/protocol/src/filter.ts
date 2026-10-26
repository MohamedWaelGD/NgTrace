import type { Body, CapturedRequest } from './types';

export type TypeChip = 'httpclient' | 'xhr' | 'fetch';
export type StatusChip = '2xx' | '3xx' | '4xx' | '5xx' | 'failed';

export interface FilterState {
  text: string;
  invert?: boolean;
  /** Empty or missing means "All". */
  types?: TypeChip[];
  statuses?: StatusChip[];
}

/** Property filter keys, in the order the autocomplete offers them. */
export const FILTER_KEYS = [
  'method',
  'status-code',
  'domain',
  'mime-type',
  'larger-than',
  'has-request-header',
  'has-response-header',
  'component',
  'service',
] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

type Predicate = (r: CapturedRequest) => boolean;

/** Compiles the Network-tab-style filter into a predicate over Captured Requests. */
export function createRequestFilter(state: FilterState): Predicate {
  const terms = tokenize(state.text).map(compileTerm);
  const textMatch: Predicate = (r) => terms.every((t) => t(r));
  const text: Predicate = state.invert && terms.length ? (r) => !textMatch(r) : textMatch;
  const types = state.types ?? [];
  const statuses = state.statuses ?? [];
  return (r) =>
    text(r) &&
    (types.length === 0 || types.includes(typeOf(r))) &&
    (statuses.length === 0 || statuses.includes(statusOf(r)));
}

export function typeOf(r: CapturedRequest): TypeChip {
  if (r.httpClient) return 'httpclient';
  return r.transport;
}

export function statusOf(r: CapturedRequest): StatusChip {
  if (r.error || r.status === null || r.status === 0) return 'failed';
  if (r.status >= 500) return '5xx';
  if (r.status >= 400) return '4xx';
  if (r.status >= 300) return '3xx';
  return '2xx';
}

export function bodySize(body: Body): number {
  return body.kind === 'none' ? 0 : (body.size ?? 0);
}

function tokenize(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function compileTerm(token: string): Predicate {
  const negated = token.startsWith('-') && token.length > 1;
  const raw = negated ? token.slice(1) : token;
  const predicate = compilePositive(raw);
  return negated ? (r) => !predicate(r) : predicate;
}

function compilePositive(raw: string): Predicate {
  const colon = raw.indexOf(':');
  if (colon > 0) {
    const key = raw.slice(0, colon).toLowerCase();
    if ((FILTER_KEYS as readonly string[]).includes(key)) {
      return compileProperty(key as FilterKey, raw.slice(colon + 1));
    }
  }
  if (raw.length > 2 && raw.startsWith('/') && raw.endsWith('/')) {
    try {
      const re = new RegExp(raw.slice(1, -1), 'i');
      return (r) => re.test(r.url);
    } catch {
      // Invalid regex: fall through to plain text, like DevTools.
    }
  }
  const needle = raw.toLowerCase();
  return (r) => r.url.toLowerCase().includes(needle);
}

function compileProperty(key: FilterKey, value: string): Predicate {
  const v = value.toLowerCase();
  switch (key) {
    case 'method':
      return (r) => r.method.toLowerCase() === v;
    case 'status-code':
      return (r) => String(r.status ?? '') === v;
    case 'domain': {
      const re = globToRegExp(v);
      return (r) => re.test(hostOf(r.url));
    }
    case 'mime-type':
      return (r) => (r.mime ?? '').toLowerCase().includes(v);
    case 'larger-than': {
      const min = parseSize(v);
      return (r) => bodySize(r.responseBody) > min;
    }
    case 'has-request-header':
      return (r) => r.requestHeaders.some(([n]) => n.toLowerCase() === v);
    case 'has-response-header':
      return (r) => r.responseHeaders.some(([n]) => n.toLowerCase() === v);
    case 'component':
      return (r) => (r.attribution.className ?? r.attribution.group ?? '').toLowerCase().includes(v);
    case 'service':
      return (r) => (r.attribution.service ?? '').toLowerCase().includes(v);
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/** Parses "500", "1k", "2.5m" into bytes. */
function parseSize(v: string): number {
  const m = /^(\d+(?:\.\d+)?)([km]?)b?$/.exec(v);
  if (!m) return Number.POSITIVE_INFINITY;
  const n = parseFloat(m[1]);
  return m[2] === 'k' ? n * 1024 : m[2] === 'm' ? n * 1024 * 1024 : n;
}
