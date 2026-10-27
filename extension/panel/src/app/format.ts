import { bodySize, statusOf, type CapturedRequest } from '@ngtrace/protocol';

export function shortName(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() ?? u.host;
    return last + u.search;
  } catch {
    return url;
  }
}

export function formatBytes(n: number | null): string {
  if (n === null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(r: CapturedRequest): string {
  if (r.endTime === null) return 'pending';
  const ms = r.endTime - r.startTime;
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

/** Wall-clock time the request started, to the millisecond (24 h, local time). */
export function formatTimestamp(r: CapturedRequest): string {
  return new Date(r.startTime).toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
}

export function statusLabel(r: CapturedRequest): string {
  if (r.error) return '(failed)';
  if (r.status === null) return '(pending)';
  return String(r.status);
}

export function statusClass(r: CapturedRequest): string {
  if (r.status === null && !r.error) return 'pending';
  return `s-${statusOf(r)}`;
}

export function responseSize(r: CapturedRequest): number | null {
  return r.responseBody.kind === 'binary' ? r.responseBody.size : bodySize(r.responseBody);
}

export function typeLabel(r: CapturedRequest): string {
  if (r.httpClient) return r.transport === 'fetch' ? 'HttpClient (fetch)' : 'HttpClient';
  return r.transport === 'fetch' ? 'fetch' : 'xhr';
}

export function ownerLabel(r: CapturedRequest): string {
  const a = r.attribution;
  if (a.via === 'route') return `${a.className ?? '?'} (route)`;
  if (a.className) return a.instanceId === null ? `${a.className} (class)` : a.className;
  const by = a.service ?? a.group;
  return by ? `via ${by}` : 'unattributed';
}
