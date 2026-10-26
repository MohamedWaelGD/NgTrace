import type { CapturedRequest } from './types';

let seq = 0;

/** Builds a CapturedRequest with sensible defaults, for tests. */
export function makeRequest(overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  seq++;
  return {
    id: `test:${seq}`,
    transport: 'xhr',
    httpClient: true,
    method: 'GET',
    url: 'http://localhost:4200/api/items',
    requestHeaders: [],
    requestBody: { kind: 'none' },
    status: 200,
    statusText: 'OK',
    error: null,
    responseHeaders: [],
    responseBody: { kind: 'none' },
    mime: null,
    startTime: 1_000,
    endTime: 1_050,
    attribution: { instanceId: null, className: null, confidence: 'none', via: 'none', callChain: [], group: null },
    enrichment: null,
    ...overrides,
  };
}
