import { describe, expect, it } from 'vitest';
import { createRequestFilter } from './filter';
import { makeRequest } from './testing';

const products = makeRequest({ url: 'http://localhost:4200/api/products?page=2', method: 'GET', status: 200 });
const login = makeRequest({
  url: 'https://auth.example.com/login',
  method: 'POST',
  status: 401,
  httpClient: false,
  transport: 'fetch',
  requestHeaders: [['Authorization', 'Bearer x']],
  mime: 'application/json',
  responseBody: { kind: 'json', text: '{}', size: 2048, truncated: false },
  attribution: { instanceId: 3, className: 'LoginComponent', confidence: 'stack', via: 'stack', callChain: [], group: null },
});
const failed = makeRequest({ url: 'http://localhost:4200/api/broken', status: null, error: 'net::ERR_FAILED' });
const all = [products, login, failed];

const run = (text: string, opts: Partial<Parameters<typeof createRequestFilter>[0]> = {}) =>
  all.filter(createRequestFilter({ text, ...opts })).map((r) => r.url);

describe('request filter', () => {
  it('matches every request when empty', () => {
    expect(run('')).toHaveLength(3);
  });

  it('matches plain text against the URL, case-insensitively', () => {
    expect(run('PRODUCTS')).toEqual([products.url]);
  });

  it('supports /regex/', () => {
    expect(run('/api\\/(products|broken)/')).toEqual([products.url, failed.url]);
  });

  it('negates a term with a leading dash', () => {
    expect(run('-products')).toEqual([login.url, failed.url]);
  });

  it('inverts the whole text filter', () => {
    expect(run('localhost', { invert: true })).toEqual([login.url]);
  });

  it('ANDs several terms', () => {
    expect(run('api -broken')).toEqual([products.url]);
  });

  it('supports method:, status-code:, domain: property filters', () => {
    expect(run('method:post')).toEqual([login.url]);
    expect(run('status-code:401')).toEqual([login.url]);
    expect(run('domain:*.example.com')).toEqual([login.url]);
    expect(run('domain:localhost')).toEqual([products.url, failed.url]);
  });

  it('supports mime-type:, larger-than:, has-request-header:, component:', () => {
    expect(run('mime-type:application/json')).toEqual([login.url]);
    expect(run('larger-than:1k')).toEqual([login.url]);
    expect(run('has-request-header:authorization')).toEqual([login.url]);
    expect(run('component:login')).toEqual([login.url]);
  });

  it('negates property filters too', () => {
    expect(run('-method:GET')).toEqual([login.url]);
  });

  it('filters by type chips', () => {
    expect(run('', { types: ['fetch'] })).toEqual([login.url]);
    expect(run('', { types: ['httpclient'] })).toEqual([products.url, failed.url]);
  });

  it('filters by status chips, including Failed', () => {
    expect(run('', { statuses: ['4xx'] })).toEqual([login.url]);
    expect(run('', { statuses: ['failed', '2xx'] })).toEqual([products.url, failed.url]);
  });

  it('treats an invalid regex as plain text instead of throwing', () => {
    expect(run('/[/')).toEqual([]);
  });
});
