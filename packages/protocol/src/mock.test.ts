import { describe, expect, it } from 'vitest';
import { matchRule, ruleError, type MockRule } from './mock';

const rule = (overrides: Partial<MockRule> = {}): MockRule => ({
  id: 'r1',
  enabled: true,
  method: '*',
  pattern: '/api/products/*',
  regex: false,
  component: null,
  delayMs: 0,
  action: { kind: 'passthrough' },
  ...overrides,
});

const req = (overrides: Partial<{ method: string; url: string; className: string | null }> = {}) => ({
  method: 'GET',
  url: 'http://localhost:4200/api/products/7?expand=1',
  className: null as string | null,
  ...overrides,
});

describe('matchRule: URL patterns', () => {
  it('matches a path glob against the path, ignoring the query string and origin', () => {
    expect(matchRule([rule()], req())?.id).toBe('r1');
    expect(matchRule([rule({ pattern: '/api/products' })], req({ url: 'http://localhost:4200/api/products?page=1' }))?.id).toBe('r1');
    expect(matchRule([rule({ pattern: '/api/products' })], req({ url: 'http://localhost:4200/api/products/7' }))).toBeNull();
  });

  it('matches the query string only when the pattern mentions one', () => {
    const r = rule({ pattern: '/api/products?page=*' });
    expect(matchRule([r], req({ url: 'http://localhost:4200/api/products?page=2' }))?.id).toBe('r1');
    expect(matchRule([r], req({ url: 'http://localhost:4200/api/products' }))).toBeNull();
  });

  it('matches a full-URL glob against the whole URL', () => {
    const r = rule({ pattern: 'https://api.example.com/*' });
    expect(matchRule([r], req({ url: 'https://api.example.com/v1/x' }))?.id).toBe('r1');
    expect(matchRule([r], req({ url: 'https://other.example.com/v1/x' }))).toBeNull();
  });

  it('treats a pattern without a leading slash or scheme as a path', () => {
    expect(matchRule([rule({ pattern: 'api/products/*' })], req())?.id).toBe('r1');
    expect(matchRule([rule({ pattern: 'api/other/*' })], req())).toBeNull();
  });

  it('matches host-style patterns without a scheme against the URL minus its scheme', () => {
    const r = rule({ pattern: 'localhost:4200/api/*' });
    expect(matchRule([r], req())?.id).toBe('r1');
    expect(matchRule([r], req({ url: 'http://localhost:9000/api/products/7' }))).toBeNull();
    expect(matchRule([rule({ pattern: 'api.example.com/v1/*' })], req({ url: 'https://api.example.com/v1/x' }))?.id).toBe('r1');
  });

  it('lets a pattern starting with * match anywhere in the full URL', () => {
    expect(matchRule([rule({ pattern: '*/products/*' })], req())?.id).toBe('r1');
  });

  it('treats regex characters in a glob literally', () => {
    expect(matchRule([rule({ pattern: '/api/a.b' })], req({ url: 'http://localhost/api/axb' }))).toBeNull();
    expect(matchRule([rule({ pattern: '/api/a.b' })], req({ url: 'http://localhost/api/a.b' }))?.id).toBe('r1');
  });

  it('matches a regex against the full URL, unanchored', () => {
    const r = rule({ regex: true, pattern: 'products/\\d+$' });
    expect(matchRule([r], req({ url: 'http://localhost/api/products/42' }))?.id).toBe('r1');
    expect(matchRule([r], req({ url: 'http://localhost/api/products/abc' }))).toBeNull();
  });
});

describe('matchRule: method and component', () => {
  it('matches the method case-insensitively, with * for any', () => {
    expect(matchRule([rule({ method: 'post' })], req({ method: 'POST' }))?.id).toBe('r1');
    expect(matchRule([rule({ method: 'POST' })], req({ method: 'GET' }))).toBeNull();
  });

  it('narrows to an Owner Component class, never matching a request without one', () => {
    const r = rule({ component: 'ProductListComponent' });
    expect(matchRule([r], req({ className: 'ProductListComponent' }))?.id).toBe('r1');
    expect(matchRule([r], req({ className: 'CartComponent' }))).toBeNull();
    expect(matchRule([r], req({ className: null }))).toBeNull();
  });
});

describe('matchRule: ordering', () => {
  it('returns the first enabled match, top to bottom', () => {
    const rules = [rule({ id: 'off', enabled: false }), rule({ id: 'first' }), rule({ id: 'second' })];
    expect(matchRule(rules, req())?.id).toBe('first');
  });

  it('returns null when nothing matches', () => {
    expect(matchRule([], req())).toBeNull();
  });
});

describe('ruleError', () => {
  it('reports an invalid regex and an empty pattern, and accepts a good rule', () => {
    expect(ruleError(rule({ regex: true, pattern: '(' }))).toMatch(/regular expression/i);
    expect(ruleError(rule({ pattern: '  ' }))).toMatch(/pattern/i);
    expect(ruleError(rule())).toBeNull();
  });
});
