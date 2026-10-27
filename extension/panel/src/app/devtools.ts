/**
 * DevTools-only actions (Elements selection, Sources). Outside DevTools (e2e tests open the panel as
 * a page) they are recorded on `window.__ngtraceDevtools` instead, so tests can assert they were issued.
 */

type Action = { kind: 'eval'; expression: string } | { kind: 'open-resource'; url: string; line: number };

function record(action: Action): void {
  const w = window as unknown as { __ngtraceDevtools?: Action[] };
  (w.__ngtraceDevtools ??= []).push(action);
}

/** Runs `expression` in the inspected page, with the Console's command-line API (`inspect()`...). */
export function inspectedEval(expression: string): void {
  const inspected = globalThis.chrome?.devtools?.inspectedWindow;
  if (inspected) inspected.eval(expression);
  else record({ kind: 'eval', expression });
}

/** Opens a resource in Sources at a 0-based line; resolves false when DevTools does not know the URL. */
export function openResource(url: string, line: number): Promise<boolean> {
  const panels = globalThis.chrome?.devtools?.panels;
  if (!panels?.openResource) {
    record({ kind: 'open-resource', url, line });
    return Promise.resolve(false);
  }
  // Typed without arguments, but the callback gets an error object (e.g. `{ code: 'E_NOTFOUND' }`) when the resource is unknown.
  const open = panels.openResource as (url: string, line: number, column: number, callback: (result?: unknown) => void) => void;
  return new Promise((resolve) => {
    open(url, line, 0, (result?: unknown) => {
      const error = result as { code?: string; isError?: boolean } | undefined;
      resolve(!error || (!error.isError && !error.code));
    });
  });
}
