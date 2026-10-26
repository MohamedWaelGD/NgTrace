import type { Page } from '@playwright/test';
import { DEMO, expect, test } from './fixtures';

const rows = (panel: Page) => panel.getByTestId('request-row');

/** Selects the request row whose Name cell is exactly `name` and opens its Initiator tab. */
async function openInitiator(panel: Page, name: string): Promise<void> {
  await rows(panel).filter({ has: panel.locator('td.name .url', { hasText: new RegExp(`^${name.replace(/[?.]/g, '\\$&')}$`) }) }).first().click();
  await panel.getByTestId('tab-initiator').click();
}

/** DevTools actions the panel issued (recorded because e2e opens the panel outside DevTools). */
const devtoolsActions = (panel: Page) => panel.evaluate(() => (window as unknown as { __ngapiDevtools?: unknown[] }).__ngapiDevtools ?? []);

test.describe('request-to-template jump', () => {
  test('Reveal in Elements is offered for a live owner and disabled on a Ghost Node', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    await expect(rows(panel).filter({ hasText: 'products?page=1' })).toHaveCount(1);
    await openInitiator(panel, 'products?page=1');
    const reveal = panel.getByTestId('initiator').getByTestId('reveal');
    await expect(reveal).toBeEnabled();
    await reveal.click();
    await expect.poll(() => devtoolsActions(panel)).toContainEqual({ kind: 'eval', expression: 'inspect(window.__ngapi_reveal)' });

    await app.click('#go-product-2');
    await expect(panel.getByTestId('node-ProductListComponent')).toHaveClass(/ghost/);
    await expect(reveal).toBeDisabled();
    await expect(reveal).toHaveAttribute('title', 'Component destroyed');
  });

  test('the tree context menu offers the jump actions', async ({ openInspector }) => {
    const { panel } = await openInspector();
    await panel.getByTestId('node-ShopComponent').click({ button: 'right' });
    const menu = panel.getByTestId('tree-menu');
    await expect(menu.getByTestId('reveal')).toBeEnabled();
    await expect(menu.getByTestId('open-sources')).toBeEnabled();
  });

  test('component details show the source location from debugInfo', async ({ openInspector }) => {
    const { panel } = await openInspector();
    await panel.getByTestId('node-ShopComponent').click();
    await expect(panel.getByTestId('source-location')).toHaveText(/^demo-app\/src\/app\/shop\.component\.ts:\d+$/);
    await panel.getByTestId('open-sources').click();
    // Outside DevTools nothing can open, so every candidate is tried and the location stays offered.
    await expect.poll(() => devtoolsActions(panel)).toContainEqual(
      expect.objectContaining({ kind: 'open-resource', url: `${DEMO}/demo-app/src/app/shop.component.ts` }),
    );
  });

  test('Open in editor appears once a project root is set, with the VS Code URL', async ({ openInspector }) => {
    const { panel } = await openInspector();
    await panel.getByTestId('node-ShopComponent').click();
    await expect(panel.getByTestId('source-location')).toBeVisible();
    await expect(panel.getByTestId('open-editor')).toHaveCount(0);

    await panel.evaluate((origin) => chrome.storage.sync.set({ [`editor:${origin}`]: { projectRoot: '/home/me/shop', editor: 'vscode' } }), DEMO);
    const location = await panel.getByTestId('source-location').innerText();
    const [file, line] = location.split(':');
    await expect(panel.getByTestId('open-editor')).toHaveAttribute('href', `vscode://file/home/me/shop/${file}:${line}:1`);
  });
});
