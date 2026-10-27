# 8. Mock Rules are armed only while the panel is open

Status: accepted (2026-10-26)

## Context
A Mock Rule changes what the app receives. A rule left active after DevTools is closed would silently make the app misbehave, and would be hard to trace. Rules are saved in `chrome.storage`, which the content script reads asynchronously, while the page hook runs at `document_start` and the app may send requests before the rules arrive.

## Decision
Rules are saved per origin but only applied while the panel is open for that tab. Closing DevTools disarms them. When rules are armed for the origin, the hook holds any request that could match until the rules are delivered, releasing them after 500 ms with a warning in the panel if they have not arrived. Rules stay armed while Recording is paused.

## How it works
- The panel sends the rules when it connects, after every edit, and every 5 s as a heartbeat. The hook treats them as live for 15 s after the last message, so a closed panel stops mocking even if its disconnect was missed. The background worker also sends an immediate disarm when the panel's port closes.
- While rules are armed the hook sets a `__ngtrace_mocks` key in the page's `sessionStorage`. At the next `document_start` it reads that key synchronously, and only then holds requests until the rules arrive. Origins without armed rules are never held.

## Consequences
- Mocked requests are always buffered and shown with a "Mocked" badge; the panel shows how many mocks are active.
- Bootstrap requests can be mocked, at the cost of a brief delay on origins with armed rules.
- Mocked requests never reach the network, so they have no Enrichment.
