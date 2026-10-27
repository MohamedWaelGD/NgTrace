import type { Body, CapturedRequest, Header } from './types';

/** A Token (JWT) found in a Captured Request. Decoded only; the signature is never verified. */
export interface Token {
  /** Where it was found: `Authorization header`, `Set-Cookie: session`, `?token=`, `response.data.access_token`. */
  location: string;
  side: 'request' | 'response';
  /** Header name when found in a header or cookie (so the panel can apply masking); null for the query string and bodies. */
  headerName: string | null;
  raw: string;
  header: Record<string, unknown>;
  claims: Record<string, unknown>;
}

const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

function decodePart(part: string): Record<string, unknown> | null {
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const text = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function decode(raw: string): Pick<Token, 'raw' | 'header' | 'claims'> | null {
  if (!JWT_SHAPE.test(raw)) return null;
  const [h, c] = raw.split('.');
  const header = decodePart(h);
  const claims = decodePart(c);
  return header && claims ? { raw, header, claims } : null;
}

function fromHeaders(headers: Header[], side: Token['side']): Token[] {
  const found: Token[] = [];
  const add = (value: string, location: string, headerName: string) => {
    const decoded = decode(value.trim());
    if (decoded) found.push({ location, side, headerName, ...decoded });
  };
  for (const [name, value] of headers) {
    const lower = name.toLowerCase();
    if (lower === 'cookie') {
      for (const pair of value.split(';')) {
        const eq = pair.indexOf('=');
        if (eq > 0) add(pair.slice(eq + 1), `${name}: ${pair.slice(0, eq).trim()}`, name);
      }
    } else if (lower === 'set-cookie') {
      const eq = value.indexOf('=');
      if (eq > 0) add(value.slice(eq + 1).split(';')[0], `${name}: ${value.slice(0, eq).trim()}`, name);
    } else {
      add(value.replace(/^\s*bearer\s+/i, ''), `${name} header`, name);
    }
  }
  return found;
}

function fromQuery(url: string): Token[] {
  try {
    return [...new URL(url).searchParams].flatMap(([name, value]) => {
      const decoded = decode(value);
      return decoded ? [{ location: `?${name}=`, side: 'request' as const, headerName: null, ...decoded }] : [];
    });
  } catch {
    return [];
  }
}

function fromBody(body: Body, side: Token['side']): Token[] {
  if (body.kind !== 'json' || body.truncated) return [];
  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return [];
  }
  const found: Token[] = [];
  const walk = (value: unknown, path: string) => {
    if (typeof value === 'string') {
      const decoded = decode(value);
      if (decoded) found.push({ location: path, side, headerName: null, ...decoded });
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`));
    } else if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
    }
  };
  walk(json, side);
  return found;
}

/** Every Token in a Captured Request: headers and cookies, the query string and JSON bodies, request side first. */
export function findTokens(r: CapturedRequest): Token[] {
  const requestHeaders = r.enrichment?.requestHeaders.length ? r.enrichment.requestHeaders : r.requestHeaders;
  return [
    ...fromHeaders(requestHeaders, 'request'),
    ...fromQuery(r.url),
    ...fromBody(r.requestBody, 'request'),
    ...fromHeaders(r.responseHeaders, 'response'),
    ...fromBody(r.responseBody, 'response'),
  ];
}

/** A Token highlights as "expiring" when it has less than this left. */
export const EXPIRY_WARNING_MS = 60_000;

export interface ExpiryState {
  status: 'none' | 'valid' | 'expiring' | 'expired';
  /** Milliseconds until `exp`; negative once expired; null without an `exp` claim. */
  msLeft: number | null;
}

export function expiryState(token: Token, now: number): ExpiryState {
  const exp = token.claims['exp'];
  if (typeof exp !== 'number') return { status: 'none', msLeft: null };
  const msLeft = exp * 1000 - now;
  return { status: msLeft <= 0 ? 'expired' : msLeft < EXPIRY_WARNING_MS ? 'expiring' : 'valid', msLeft };
}

/** True when the Token's `exp` had already passed at the moment the request was sent (an expired token behind a 401). */
export function expiredAtSend(token: Token, r: CapturedRequest): boolean {
  const exp = token.claims['exp'];
  return typeof exp === 'number' && exp * 1000 <= r.startTime;
}

function span(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

/** "expires in 4m 12s" / "expired 3h ago". */
export function expiryLabel(state: ExpiryState): string {
  if (state.msLeft === null) return 'no expiry';
  return state.msLeft <= 0 ? `expired ${span(-state.msLeft)} ago` : `expires in ${span(state.msLeft)}`;
}
