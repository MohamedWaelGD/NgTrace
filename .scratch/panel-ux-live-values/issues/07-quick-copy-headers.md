# Quick-copy Headers setting and request-detail buttons

Status: resolved
Blocked by: 06

## What
- Add `quickCopyHeaders: string[]` (default `['Authorization']`) to `Settings` in `extension/src/settings.ts`. Add a "Quick-copy headers" textarea to `options.html`/`options.ts`, one name per line, with save and reset, the same as masked headers.
- The panel loads the setting and reacts to `chrome.storage.onChanged`.
- In the request detail toolbar, add one `Copy <Name>` button per configured header that the selected request carries (matched case-insensitively). It copies the raw value, and offers "token only" when the value starts with `Bearer `.

## Acceptance
- Unit test: matching is case-insensitive, and Bearer prefix stripping works.
- e2e: with the default setting, a request that has `Authorization` shows the button and copies the raw value. A request without it shows no button.

## Comments

2026-10-26: Implemented: `quickCopyHeaders` setting + options UI, request-detail buttons with "token" for Bearer values. Unit: packages/protocol/src/quick-copy.test.ts. e2e: e2e/ux.spec.ts.
