import type { Header } from './types';

export type MockAction =
  /** Answer with a canned response; the real request is never sent. */
  | { kind: 'respond'; status: number; headers: Header[]; body: string }
  /** Fail like a network error; the real request is never sent. */
  | { kind: 'error' }
  /** Send the real request, but only after `delayMs`. */
  | { kind: 'delay' }
  /** Matches and stops further rules, leaving the request alone. */
  | { kind: 'passthrough' };

/** A Mock Rule (see GLOSSARY.md). `delayMs` adds latency to every action, mocked or real. */
export interface MockRule {
  id: string;
  enabled: boolean;
  /** HTTP method, or `*` for any. */
  method: string;
  /** Glob (`*` matches anything) or, with `regex`, a regular expression tested against the full URL. */
  pattern: string;
  regex: boolean;
  /** Owner Component class name; null matches every request. */
  component: string | null;
  delayMs: number;
  action: MockAction;
}

/** What a rule is matched against: the request as sent, with its Owner Component class when known. */
export interface MockTarget {
  method: string;
  url: string;
  className: string | null;
}

const escapeRegex = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
const globToRegex = (glob: string) => new RegExp(`^${glob.split('*').map(escapeRegex).join('.*')}$`);

/** `localhost:4200/api/*` or `api.example.com/v1`: the first segment looks like a host. */
function isHostStyle(pattern: string): boolean {
  const first = pattern.split('/')[0];
  return !pattern.startsWith('/') && /^(localhost|[^*]*[.:][^*]*)$/.test(first);
}

function matchesUrl(rule: MockRule, url: string): boolean {
  if (rule.regex) return new RegExp(rule.pattern).test(url);
  const pattern = rule.pattern.trim();
  if (pattern.includes('://') || pattern.startsWith('*')) return globToRegex(pattern).test(url);
  if (isHostStyle(pattern)) return globToRegex(pattern).test(url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ''));
  try {
    const parsed = new URL(url);
    const path = pattern.startsWith('/') ? pattern : `/${pattern}`;
    return globToRegex(path).test(parsed.pathname + (pattern.includes('?') ? parsed.search : ''));
  } catch {
    return false;
  }
}

/** First enabled rule (top to bottom) that matches, or null. An invalid rule never matches. */
export function matchRule(rules: MockRule[], target: MockTarget): MockRule | null {
  for (const rule of rules) {
    if (!rule.enabled || ruleError(rule)) continue;
    if (rule.method !== '*' && rule.method.toUpperCase() !== target.method.toUpperCase()) continue;
    if (rule.component !== null && rule.component !== target.className) continue;
    if (matchesUrl(rule, target.url)) return rule;
  }
  return null;
}

/** Why a rule cannot be applied, for the rule editor; null when it is fine. */
export function ruleError(rule: MockRule): string | null {
  if (!rule.pattern.trim()) return 'Enter a URL pattern.';
  if (rule.regex) {
    try {
      new RegExp(rule.pattern);
    } catch {
      return 'The pattern is not a valid regular expression.';
    }
  }
  return null;
}
