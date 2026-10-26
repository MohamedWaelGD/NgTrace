import type { Page } from '@playwright/test';
import { DEMO_ZONELESS, expect, test } from './fixtures';

const rows = (panel: Page) => panel.getByTestId('request-row');

async function initiatorOf(panel: Page, name: string): Promise<string> {
  await rows(panel).filter({ has: panel.locator('td.name', { hasText: new RegExp(`^${name.replace(/[?.]/g, '\\$&')}$`) }) }).first().click();
  await panel.getByTestId('tab-initiator').click();
  return (await panel.getByTestId('initiator').innerText()).replace(/\s+/g, ' ');
}

// ADR 2: without zone.js, attribution relies on the profiler (sync) and native async patches.
test.describe('zoneless demo-app', () => {
  test('detects zoneless dev mode and attributes lifecycle, listener and timer requests', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/', DEMO_ZONELESS);
    await expect(panel.locator('.info')).toContainText('dev mode · zoneless');
    await expect(rows(panel).filter({ hasText: 'legacy?format=xml' })).toHaveCount(1);

    expect(await initiatorOf(panel, 'products?page=1')).toContain('ProductListComponent');
    expect(await initiatorOf(panel, 'legacy?format=xml')).toContain('LegacyWidgetComponent');

    await app.click('#add-to-cart');
    await expect(rows(panel).filter({ hasText: 'cart' })).toHaveCount(1);
    expect(await initiatorOf(panel, 'cart')).toContain('context (listener)');

    await app.fill('#search', 'sc');
    await expect(rows(panel).filter({ hasText: 'search?q=sc' })).toHaveCount(1);
    const search = await initiatorOf(panel, 'search?q=sc');
    expect(search).toContain('Owner Component SearchComponent');
    expect(search).toContain('context (async)');
  });
});
