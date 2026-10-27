import { describe, expect, it } from 'vitest';
import { expiredAtSend, expiryLabel, expiryState, findTokens } from './jwt';
import { makeRequest } from './testing';

const b64url = (v: unknown) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const jwt = (claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' }) =>
  `${b64url(header)}.${b64url(claims)}.c2lnbmF0dXJl`;

describe('findTokens: headers', () => {
  it('decodes a Bearer token in a request header', () => {
    const t = jwt({ sub: 'u1', name: 'Ada' });
    const [token] = findTokens(makeRequest({ requestHeaders: [['Authorization', `Bearer ${t}`]] }));
    expect(token).toMatchObject({
      location: 'Authorization header',
      side: 'request',
      headerName: 'Authorization',
      raw: t,
      header: { alg: 'HS256', typ: 'JWT' },
      claims: { sub: 'u1', name: 'Ada' },
    });
  });

  it('decodes a bare token value in a response header', () => {
    const t = jwt({ sub: 'u1' });
    const [token] = findTokens(makeRequest({ responseHeaders: [['X-Auth', t]] }));
    expect(token).toMatchObject({ location: 'X-Auth header', side: 'response', headerName: 'X-Auth' });
  });

  it('ignores values that are not well-formed tokens', () => {
    const r = makeRequest({
      requestHeaders: [
        ['A', 'abc.def'],
        ['B', 'not.a.jwt'],
        ['C', `${b64url('plain text')}.${b64url('plain text')}.sig`],
        ['D', 'Bearer opaque-token-value'],
      ],
    });
    expect(findTokens(r)).toEqual([]);
  });

  it('reads base64url with - and _ and without padding', () => {
    const claims = { note: '??>>~~ü', n: 1 };
    const t = jwt(claims);
    expect(t).toMatch(/[-_]/);
    expect(findTokens(makeRequest({ requestHeaders: [['Authorization', `Bearer ${t}`]] }))[0].claims).toEqual(claims);
  });
});

describe('findTokens: cookies, query and bodies', () => {
  it('finds a token in a Cookie header among several cookies', () => {
    const t = jwt({ sub: 'u1' });
    const tokens = findTokens(makeRequest({ requestHeaders: [['Cookie', `theme=dark; session=${t}; lang=en`]] }));
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ location: 'Cookie: session', headerName: 'Cookie', side: 'request' });
  });

  it('finds a token in a Set-Cookie header, one per header', () => {
    const a = jwt({ sub: 'a' });
    const b = jwt({ sub: 'b' });
    const tokens = findTokens(
      makeRequest({
        responseHeaders: [
          ['Set-Cookie', `access=${a}; Path=/; HttpOnly`],
          ['Set-Cookie', `refresh=${b}; Path=/`],
        ],
      }),
    );
    expect(tokens.map((t) => [t.location, t.headerName, t.side])).toEqual([
      ['Set-Cookie: access', 'Set-Cookie', 'response'],
      ['Set-Cookie: refresh', 'Set-Cookie', 'response'],
    ]);
  });

  it('finds a token in a query parameter, with no header name', () => {
    const t = jwt({ sub: 'u1' });
    const [token] = findTokens(makeRequest({ url: `http://localhost:4200/api/items?page=2&token=${t}` }));
    expect(token).toMatchObject({ location: '?token=', side: 'request', headerName: null, raw: t });
  });

  it('finds tokens nested in JSON response and request bodies', () => {
    const t = jwt({ sub: 'u1' });
    const u = jwt({ sub: 'u2' });
    const tokens = findTokens(
      makeRequest({
        requestBody: { kind: 'json', text: JSON.stringify({ refresh: u }), size: 1, truncated: false },
        responseBody: { kind: 'json', text: JSON.stringify({ data: { access_token: t }, list: [{ t }] }), size: 1, truncated: false },
      }),
    );
    expect(tokens.map((x) => [x.location, x.side])).toEqual([
      ['request.refresh', 'request'],
      ['response.data.access_token', 'response'],
      ['response.list[0].t', 'response'],
    ]);
  });

  it('skips bodies that are not JSON or are truncated', () => {
    const t = jwt({ sub: 'u1' });
    const r = makeRequest({
      responseBody: { kind: 'json', text: `{"t":"${t}"`, size: 1, truncated: true },
      requestBody: { kind: 'text', text: t, size: 1, truncated: false },
    });
    expect(findTokens(r)).toEqual([]);
  });
});

describe('expiry', () => {
  const at = (exp?: number) => findTokens(makeRequest({ requestHeaders: [['Authorization', `Bearer ${jwt(exp === undefined ? { sub: 'u' } : { exp })}`]], startTime: 1_000_000 }))[0];
  const now = 1_000_000;

  it('has no expiry without an exp claim', () => {
    expect(expiryState(at(), now)).toEqual({ status: 'none', msLeft: null });
    expect(expiryLabel(expiryState(at(), now))).toBe('no expiry');
  });

  it('is valid with time left, expiring under 60 s, expired after', () => {
    expect(expiryState(at(1_000 + 252), now)).toEqual({ status: 'valid', msLeft: 252_000 });
    expect(expiryState(at(1_000 + 59), now)).toEqual({ status: 'expiring', msLeft: 59_000 });
    expect(expiryState(at(1_000 - 3 * 3600), now)).toEqual({ status: 'expired', msLeft: -10_800_000 });
  });

  it('labels the countdown', () => {
    expect(expiryLabel({ status: 'valid', msLeft: 252_000 })).toBe('expires in 4m 12s');
    expect(expiryLabel({ status: 'expiring', msLeft: 9_000 })).toBe('expires in 9s');
    expect(expiryLabel({ status: 'valid', msLeft: 2 * 3600_000 + 5 * 60_000 })).toBe('expires in 2h 5m');
    expect(expiryLabel({ status: 'expired', msLeft: -10_800_000 })).toBe('expired 3h ago');
    expect(expiryLabel({ status: 'expired', msLeft: -45_000 })).toBe('expired 45s ago');
  });

  it('knows whether the token was already expired when the request was sent', () => {
    const r = (exp: number) => makeRequest({ requestHeaders: [['Authorization', `Bearer ${jwt({ exp })}`]], startTime: 1_000_000 });
    expect(expiredAtSend(findTokens(r(999))[0], r(999))).toBe(true);
    expect(expiredAtSend(findTokens(r(1_001))[0], r(1_001))).toBe(false);
    expect(expiredAtSend(at(), makeRequest({ startTime: 1_000_000 }))).toBe(false);
  });
});
