# Reveal the Owner Component's host element in Elements

Status: resolved
Blocked by: none

## What
Hook: on a `reveal` command with an Instance Id, store the host element where `inspectedWindow.eval` can reach it (e.g. `window.__ngapi_reveal`), or report that the instance is gone. Panel: run `inspectedWindow.eval('inspect(window.__ngapi_reveal)')`. Button in the request drawer next to Owner Component and in the tree node context menu; disabled on Ghost Nodes with "Component destroyed".

## Acceptance
Unit test: the hook resolves a live instance and reports a destroyed one. e2e: the button is enabled for a live owner and disabled for a Ghost Node (the Elements selection itself cannot be asserted from Playwright; assert the eval was issued).

## Comments
2026-10-26: Implemented (hook reveal.ts + 'reveal'/'revealed' messages; panel devtools.ts inspectedEval, source-actions.ts in drawer, details and tree context menu; e2e/template-jump.spec.ts).
