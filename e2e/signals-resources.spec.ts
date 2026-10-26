import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const rows = (panel: Page) => panel.getByTestId('request-row');
const rowNames = (panel: Page) => rows(panel).locator('td.name .url').allInnerTexts();

async function initiatorOf(panel: Page, name: string): Promise<string> {
  await rows(panel).filter({ has: panel.locator('td.name .url', { hasText: new RegExp(`^${name.replace(/[?.]/g, '\\$&')}$`) }) }).first().click();
  await panel.getByTestId('tab-initiator').click();
  return (await panel.getByTestId('initiator').innerText()).replace(/\s+/g, ' ');
}

test.describe('signals and resources', () => {
  test('httpResource (with and without debugName) and rxResource requests get their Owner Resource', async ({ openInspector }) => {
    const { panel } = await openInspector('/resources');
    await expect.poll(() => rowNames(panel)).toEqual(expect.arrayContaining(['1', 'search?q=1']));

    const product = await initiatorOf(panel, '1');
    expect(product).toContain('Owner Component ResourcesComponent');
    expect(product).toContain('Owner Resource ResourcesComponent.product');
    expect(await initiatorOf(panel, '1')).toContain('Confidence context (resource)');
    expect(await initiatorOf(panel, 'search?q=1')).toContain('Owner Resource ResourcesComponent.matches');
    await panel.getByTestId('filter').fill('stock');
    expect(await initiatorOf(panel, '1')).toContain('Owner Resource ResourcesComponent.stockLevel');
  });

  test('filtering by an Owner Resource narrows the table to its requests', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/resources');
    await app.click('#next-product');
    await panel.getByTestId('resource-ResourcesComponent.product').click();
    await expect(panel.getByTestId('filter')).toHaveValue('resource:ResourcesComponent.product');
    await expect.poll(() => rowNames(panel)).toEqual(['1', '2']);
  });

  test('a computed lists its producers and flashes when a source signal changes', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/resources');
    await panel.getByTestId('node-ResourcesComponent').click();
    const label = panel.getByTestId('signal-label');
    await expect(label).toContainText('"Product #1"');
    await expect(label.getByTestId('depends-on')).toHaveText(['id']);

    await app.click('#next-product');
    await expect(label).toContainText('"Product #2"');
    await expect(label).toHaveClass(/flash/);
    await expect(panel.getByTestId('signal-id')).toContainText('2');
  });
});
