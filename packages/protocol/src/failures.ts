import type { CapturedRequest } from './types';

/** All attempts of one request: the first attempt and its Retries, in Attempt Number order. */
export interface RetryChain {
  /** Id of the first attempt (it may have been evicted from the buffer). */
  rootId: string;
  attempts: CapturedRequest[];
  /** The last attempt succeeded after earlier ones failed. */
  recovered: boolean;
}

export interface FailureSummary {
  /** Owner Component, else Owner Service, else "Unattributed". */
  group: string;
  kind: 'component' | 'service' | 'unattributed';
  failed: number;
  retries: number;
  recovered: number;
}

const isAborted = (r: CapturedRequest) => r.error !== null && /abort/i.test(r.error);

/** A Failed Request: a network-level error or a status ≥ 400. Aborted requests are not failures. */
export function isFailed(r: CapturedRequest): boolean {
  if (r.error !== null) return !isAborted(r);
  return r.status !== null && r.status >= 400;
}

const isRetry = (r: CapturedRequest) => r.retryOf !== undefined;

/** Retry chains, keyed by the id of every attempt in them. Requests never retried have no chain. */
export function retryChains(requests: CapturedRequest[]): Map<string, RetryChain> {
  const byRoot = new Map<string, CapturedRequest[]>();
  for (const r of requests) {
    if (!isRetry(r)) continue;
    byRoot.set(r.retryOf!, [...(byRoot.get(r.retryOf!) ?? []), r]);
  }
  const result = new Map<string, RetryChain>();
  for (const [rootId, retries] of byRoot) {
    const first = requests.find((r) => r.id === rootId);
    const attempts = [...(first ? [first] : []), ...retries].sort((a, b) => (a.attempt ?? 1) - (b.attempt ?? 1));
    const last = attempts[attempts.length - 1];
    const chain: RetryChain = { rootId, attempts, recovered: last.endTime !== null && last.error === null && !isFailed(last) };
    for (const a of attempts) result.set(a.id, chain);
  }
  return result;
}

/** Failures, Retries and recovered chains per Owner Component (Unattributed ones per Owner Service), most failures first. */
export function summariseFailures(requests: CapturedRequest[]): FailureSummary[] {
  const chains = retryChains(requests);
  const groups = new Map<string, FailureSummary>();
  const entryFor = (r: CapturedRequest) => {
    const a = r.attribution;
    const [group, kind]: [string, FailureSummary['kind']] = a.className
      ? [a.className, 'component']
      : a.service
        ? [a.service, 'service']
        : ['Unattributed', 'unattributed'];
    const entry = groups.get(group) ?? { group, kind, failed: 0, retries: 0, recovered: 0 };
    groups.set(group, entry);
    return entry;
  };
  for (const r of requests) {
    const failed = isFailed(r);
    const retry = isRetry(r);
    const chain = chains.get(r.id);
    const recoveredHere = !!chain?.recovered && chain.attempts[chain.attempts.length - 1] === r;
    if (!failed && !retry && !recoveredHere) continue;
    const entry = entryFor(r);
    if (failed) entry.failed++;
    if (retry) entry.retries++;
    if (recoveredHere) entry.recovered++;
  }
  return [...groups.values()].sort((a, b) => b.failed - a.failed);
}
