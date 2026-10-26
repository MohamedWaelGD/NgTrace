import { bodyText } from './export';
import type { Body, CapturedRequest, Header } from './types';

export interface HeaderChange {
  name: string;
  change: 'added' | 'removed' | 'changed';
  from?: string;
  to?: string;
}

export interface JsonChange {
  /** JSONPath-like, e.g. `$.items[1].name`. */
  path: string;
  change: 'added' | 'removed' | 'changed';
  from?: unknown;
  to?: unknown;
}

export interface LineOp {
  op: 'same' | 'add' | 'remove';
  text: string;
}

export type BodyDiff =
  | { kind: 'same' }
  | { kind: 'json'; changes: JsonChange[] }
  | { kind: 'text'; lines: LineOp[] }
  | { kind: 'unavailable' };

export interface ResponseDiff {
  status: { from: number | null; to: number | null } | null;
  headers: HeaderChange[];
  body: BodyDiff;
}

/** Compares two responses: status, headers (names case-insensitive), and the body (JSON structure, or text lines). */
export function diffResponses(a: CapturedRequest, b: CapturedRequest): ResponseDiff {
  return {
    status: a.status === b.status ? null : { from: a.status, to: b.status },
    headers: diffHeaders(a.responseHeaders, b.responseHeaders),
    body: diffBodies(a.responseBody, b.responseBody),
  };
}

function headerMap(headers: Header[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const [name, value] of headers) {
    const key = name.toLowerCase();
    map.set(key, map.has(key) ? `${map.get(key)}, ${value}` : value);
  }
  return map;
}

function diffHeaders(a: Header[], b: Header[]): HeaderChange[] {
  const from = headerMap(a);
  const to = headerMap(b);
  const changes: HeaderChange[] = [];
  for (const [name, value] of from) {
    if (!to.has(name)) changes.push({ name, change: 'removed', from: value });
    else if (to.get(name) !== value) changes.push({ name, change: 'changed', from: value, to: to.get(name) });
  }
  for (const [name, value] of to) if (!from.has(name)) changes.push({ name, change: 'added', to: value });
  return changes;
}

function textOf(body: Body): string | null {
  return body.kind === 'none' ? '' : bodyText(body);
}

function diffBodies(a: Body, b: Body): BodyDiff {
  const left = textOf(a);
  const right = textOf(b);
  if (left === null || right === null) return { kind: 'unavailable' };
  const parsed = [tryParse(left), tryParse(right)];
  if (parsed[0].ok && parsed[1].ok) {
    const changes: JsonChange[] = [];
    diffJson('$', parsed[0].value, parsed[1].value, changes);
    return changes.length ? { kind: 'json', changes } : { kind: 'same' };
  }
  const lines = diffLines(left.split('\n'), right.split('\n'));
  return lines.every((l) => l.op === 'same') ? { kind: 'same' } : { kind: 'text', lines };
}

function tryParse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

const isContainer = (v: unknown): v is Record<string, unknown> | unknown[] => typeof v === 'object' && v !== null;
const keyPath = (parent: string, key: string) => (/^[A-Za-z_$][\w$]*$/.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`);

function diffJson(path: string, a: unknown, b: unknown, out: JsonChange[]): void {
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const at = `${path}[${i}]`;
      if (i >= b.length) out.push({ path: at, change: 'removed', from: a[i] });
      else if (i >= a.length) out.push({ path: at, change: 'added', to: b[i] });
      else diffJson(at, a[i], b[i], out);
    }
    return;
  }
  if (isContainer(a) && isContainer(b) && !Array.isArray(a) && !Array.isArray(b)) {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    for (const key of Object.keys(left)) {
      if (!(key in right)) out.push({ path: keyPath(path, key), change: 'removed', from: left[key] });
      else diffJson(keyPath(path, key), left[key], right[key], out);
    }
    for (const key of Object.keys(right)) if (!(key in left)) out.push({ path: keyPath(path, key), change: 'added', to: right[key] });
    return;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path, change: 'changed', from: a, to: b });
}

const MAX_LCS_CELLS = 4_000_000;

/** Line diff by longest common subsequence; very large inputs fall back to "all removed, all added". */
function diffLines(a: string[], b: string[]): LineOp[] {
  if (a.length * b.length > MAX_LCS_CELLS) {
    return [...a.map((text) => ({ op: 'remove' as const, text })), ...b.map((text) => ({ op: 'add' as const, text }))];
  }
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const ops: LineOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ op: 'same', text: a[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ op: 'remove', text: a[i++] });
    } else {
      ops.push({ op: 'add', text: b[j++] });
    }
  }
  while (i < a.length) ops.push({ op: 'remove', text: a[i++] });
  while (j < b.length) ops.push({ op: 'add', text: b[j++] });
  return ops;
}
