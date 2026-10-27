import type { CapturedRequest } from './types';

/** Arrays contribute at most this many elements to a Contract. */
export const MAX_SAMPLED_ELEMENTS = 100;

const NUMERIC = /^\d+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_HEX = /^[0-9a-f]{16,}$/i;

/** Endpoint of a Captured Request: method + path with numeric, UUID and long-hex segments as `:id`; the query is ignored. */
export function endpointOf(r: Pick<CapturedRequest, 'method' | 'url'>): string {
  let path: string;
  try {
    path = new URL(r.url).pathname;
  } catch {
    path = r.url.split(/[?#]/)[0];
  }
  const templated = path
    .split('/')
    .map((seg) => (NUMERIC.test(seg) || UUID.test(seg) || LONG_HEX.test(seg) ? ':id' : seg))
    .join('/');
  return `${r.method.toUpperCase()} ${templated}`;
}

export type Primitive = 'string' | 'number' | 'boolean' | 'null';
const PRIMITIVES: Primitive[] = ['string', 'number', 'boolean', 'null'];

/** What a JSON value (or many merged values) looked like. A shape with no kinds is an unknown type (an empty array's elements). */
export interface Shape {
  prims: Primitive[];
  object: ObjectShape | null;
  /** Merged shape of the array elements. */
  array: Shape | null;
}

export interface ObjectShape {
  /** How many objects were merged into this shape. */
  count: number;
  fields: Record<string, { shape: Shape; /** In how many of those objects the field appeared. */ seen: number }>;
}

const emptyShape = (): Shape => ({ prims: [], object: null, array: null });

/** The kinds a shape holds, in a stable order: primitives, then `object`, then `array`. */
export function shapeKinds(s: Shape): string[] {
  return [...PRIMITIVES.filter((p) => s.prims.includes(p)), ...(s.object ? ['object'] : []), ...(s.array ? ['array'] : [])];
}

export function inferShape(json: unknown): Shape {
  const s = emptyShape();
  if (json === null) s.prims = ['null'];
  else if (typeof json === 'string' || typeof json === 'number' || typeof json === 'boolean') s.prims = [typeof json as Primitive];
  else if (Array.isArray(json)) {
    s.array = json.slice(0, MAX_SAMPLED_ELEMENTS).reduce<Shape>((acc, el) => mergeShapes(acc, inferShape(el)), emptyShape());
  } else if (typeof json === 'object') {
    s.object = { count: 1, fields: Object.fromEntries(Object.entries(json).map(([k, v]) => [k, { shape: inferShape(v), seen: 1 }])) };
  }
  return s;
}

export function mergeShapes(a: Shape, b: Shape): Shape {
  const fields: ObjectShape['fields'] = {};
  if (a.object || b.object) {
    for (const side of [a.object, b.object]) {
      for (const [k, f] of Object.entries(side?.fields ?? {})) {
        const have = fields[k];
        fields[k] = have ? { shape: mergeShapes(have.shape, f.shape), seen: have.seen + f.seen } : f;
      }
    }
  }
  return {
    prims: PRIMITIVES.filter((p) => a.prims.includes(p) || b.prims.includes(p)),
    object: a.object || b.object ? { count: (a.object?.count ?? 0) + (b.object?.count ?? 0), fields } : null,
    array: a.array && b.array ? mergeShapes(a.array, b.array) : (a.array ?? b.array),
  };
}

export interface DriftVariant {
  label: string;
  requestIds: string[];
}

/** Drift (see GLOSSARY): a field whose type, presence or nullability differs between the Captured Requests of an Endpoint. */
export interface DriftEntry {
  /** `$` is the body root, `[]` an array element: `$.items[].price`. */
  path: string;
  kind: 'type' | 'optional' | 'nullable';
  /** The sides that disagree, each with the requests on it. */
  variants: DriftVariant[];
}

export type SkipReason = 'truncated' | 'not-json';

export interface Contract {
  endpoint: string;
  /** Merged shape of every response used; null when none could be inferred. */
  shape: Shape | null;
  /** Ids of the responses the shape was built from. */
  used: string[];
  /** 2xx responses of the Endpoint that could not be used. */
  skipped: { id: string; reason: SkipReason }[];
  drift: DriftEntry[];
}

/** Kinds at every path of one response's shape. A path with no kinds (an empty array's elements) is unknown. */
function kindsByPath(shape: Shape, path = '$', into = new Map<string, Set<string>>()): Map<string, Set<string>> {
  into.set(path, new Set(shapeKinds(shape)));
  for (const [k, f] of Object.entries(shape.object?.fields ?? {})) kindsByPath(f.shape, `${path}.${k}`, into);
  if (shape.array) kindsByPath(shape.array, `${path}[]`, into);
  return into;
}

const valueKey = (kinds: Set<string>) => [...kinds].filter((k) => k !== 'null').join(' | ');

function detectDrift(perRequest: { id: string; paths: Map<string, Set<string>> }[]): DriftEntry[] {
  const allPaths = new Set(perRequest.flatMap((r) => [...r.paths.keys()]));
  const drift: DriftEntry[] = [];
  for (const path of allPaths) {
    // type: more than one distinct non-null kind combination
    const byType = new Map<string, string[]>();
    for (const r of perRequest) {
      const key = valueKey(r.paths.get(path) ?? new Set());
      if (key) byType.set(key, [...(byType.get(key) ?? []), r.id]);
    }
    if (byType.size > 1) drift.push({ path, kind: 'type', variants: [...byType].map(([label, requestIds]) => ({ label, requestIds })) });

    // optional: a field present in some responses and missing from others whose parent object is there
    const field = /\.[^.[\]]+$/.exec(path);
    if (field) {
      const parent = path.slice(0, field.index);
      const present = perRequest.filter((r) => r.paths.has(path)).map((r) => r.id);
      const missing = perRequest.filter((r) => !r.paths.has(path) && r.paths.get(parent)?.has('object')).map((r) => r.id);
      if (present.length && missing.length) {
        drift.push({ path, kind: 'optional', variants: [{ label: 'present', requestIds: present }, { label: 'missing', requestIds: missing }] });
      }
    }

    // nullable: null in some responses, a value in others
    const nulls = perRequest.filter((r) => r.paths.get(path)?.has('null')).map((r) => r.id);
    const values = perRequest.filter((r) => valueKey(r.paths.get(path) ?? new Set())).map((r) => r.id);
    if (nulls.length && values.length && (nulls.some((id) => !values.includes(id)) || values.some((id) => !nulls.includes(id)))) {
      drift.push({ path, kind: 'nullable', variants: [{ label: 'null', requestIds: nulls }, { label: 'value', requestIds: values }] });
    }
  }
  return drift;
}

type Parsed = { skip: SkipReason } | { shape: Shape; paths: Map<string, Set<string>> };

/** Parsed responses by request object: the panel rebuilds a Contract on every new request, and bodies can be large. */
const parsed = new WeakMap<CapturedRequest, Parsed>();

function parseResponse(r: CapturedRequest): Parsed {
  const cached = parsed.get(r);
  if (cached) return cached;
  const body = r.responseBody;
  let result: Parsed;
  if ((body.kind === 'json' || body.kind === 'text') && body.truncated) result = { skip: 'truncated' };
  else {
    try {
      if (body.kind !== 'json') throw new Error('not json');
      const shape = inferShape(JSON.parse(body.text));
      result = { shape, paths: kindsByPath(shape) };
    } catch {
      result = { skip: 'not-json' };
    }
  }
  parsed.set(r, result);
  return result;
}

/** The Contract of one Endpoint from the buffered requests: only 2xx responses count, and only parseable, complete JSON bodies feed the shape. */
export function buildContract(requests: CapturedRequest[], endpoint: string): Contract {
  const contract: Contract = { endpoint, shape: null, used: [], skipped: [], drift: [] };
  const perRequest: { id: string; paths: Map<string, Set<string>> }[] = [];
  for (const r of requests) {
    if (endpointOf(r) !== endpoint || r.status === null || r.status < 200 || r.status > 299) continue;
    const result = parseResponse(r);
    if ('skip' in result) {
      contract.skipped.push({ id: r.id, reason: result.skip });
      continue;
    }
    contract.shape = contract.shape ? mergeShapes(contract.shape, result.shape) : result.shape;
    contract.used.push(r.id);
    perRequest.push({ id: r.id, paths: result.paths });
  }
  contract.drift = detectDrift(perRequest);
  return contract;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

const pascal = (s: string) =>
  s
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');

/** Best-effort English singular for naming interfaces: products → product, categories → category, addresses → address. */
function singular(word: string): string {
  if (/(us|is|ss)$/i.test(word)) return word;
  if (/ies$/i.test(word)) return word.replace(/ies$/i, 'y');
  if (/(s|x|z|ch|sh)es$/i.test(word)) return word.replace(/es$/i, '');
  return word.replace(/s$/i, '');
}

/** Root interface name: the endpoint's last non-placeholder path segment, singularised; `Response` when there is none. */
function rootName(endpoint: string): string {
  const path = endpoint.slice(endpoint.indexOf(' ') + 1);
  const segment = path.split('/').filter((s) => s && s !== ':id').pop();
  const name = segment ? pascal(singular(segment)) : '';
  if (!name) return 'Response';
  return /^\d/.test(name) ? `Response${name}` : name;
}

const arrayOf = (element: string) => `${element.includes(' | ') ? `(${element})` : element}[]`;

/** TypeScript interfaces for a Contract. Fields seen in only some responses are optional; `null` mixed with a value becomes `| null`. */
export function toTypeScript(contract: Contract): string {
  const root = contract.shape;
  if (!root) return '';
  const blocks: string[] = [];
  const used = new Set<string>();

  const uniqueName = (base: string) => {
    let name = base;
    for (let i = 2; used.has(name); i++) name = `${base}${i}`;
    used.add(name);
    return name;
  };

  const emitInterface = (base: string, obj: ObjectShape): string => {
    const name = uniqueName(base);
    const slot = blocks.length;
    blocks.push('');
    const lines = Object.entries(obj.fields).map(([key, f]) => {
      const prop = IDENTIFIER.test(key) ? key : JSON.stringify(key);
      const optional = f.seen < obj.count ? '?' : '';
      return `  ${prop}${optional}: ${typeExpr(f.shape, name + pascal(key), name + pascal(singular(key)))};`;
    });
    blocks[slot] = `export interface ${name} {\n${lines.join('\n')}${lines.length ? '\n' : ''}}`;
    return name;
  };

  /** `objName` names an object found here, `elemName` an object found one array level down. */
  const typeExpr = (shape: Shape, objName: string, elemName: string): string => {
    const parts: string[] = shape.prims.filter((p) => p !== 'null');
    if (shape.object) parts.push(emitInterface(objName, shape.object));
    if (shape.array) {
      parts.push(arrayOf(typeExpr(shape.array, elemName, elemName)));
    }
    if (shape.prims.includes('null')) parts.push('null');
    return parts.length ? parts.join(' | ') : 'unknown';
  };

  const name = rootName(contract.endpoint);
  const pureObject = root.object && !root.prims.length && !root.array;
  const pureArray = root.array && !root.prims.length && !root.object;
  if (pureObject) emitInterface(name, root.object!);
  else if (pureArray) {
    blocks.push(`export type ${name}List = ${arrayOf(typeExpr(root.array!, name, name))};`);
  }
  else blocks.push(`export type ${name}Response = ${typeExpr(root, name, name)};`);
  return blocks.join('\n\n') + '\n';
}

export interface ShapeRow {
  depth: number;
  /** Field name, `[]` for array elements, `$` for the root. */
  label: string;
  types: string;
  /** The field was missing from some of the objects merged into the shape. */
  optional: boolean;
}

/** A shape as flat, indented rows for display. */
export function shapeRows(shape: Shape, label = '$', depth = 0, optional = false): ShapeRow[] {
  const rows: ShapeRow[] = [{ depth, label, types: shapeKinds(shape).join(' | ') || 'unknown', optional }];
  for (const [key, f] of Object.entries(shape.object?.fields ?? {})) {
    rows.push(...shapeRows(f.shape, key, depth + 1, f.seen < shape.object!.count));
  }
  if (shape.array) rows.push(...shapeRows(shape.array, '[]', depth + 1));
  return rows;
}
