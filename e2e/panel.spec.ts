import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const rowNames = (panel: Page) => panel.getByTestId('request-row').locator('td.name .url').allInnerTexts();

async function loadAll(openInspector: (path?: string) => Promise<{ app: Page; panel: Page }>) {
  const { app, panel } = await openInspector();
  await app.click('#add-to-cart');
  await app.click('#load-broken');
  await expect.poll(async () => (await rowNames(panel)).length).toBe(11);
  return { app, panel };
}

test.describe('panel', () => {
  test('filter bar: property filters, negation, invert and status chips', async ({ openInspector }) => {
    const { panel } = await loadAll(openInspector);
    const filter = panel.getByTestId('filter');

    await filter.fill('method:POST');
    await expect.poll(() => rowNames(panel)).toEqual(['cart']);

    await filter.fill('component:legacy -legacy');
    await expect.poll(() => rowNames(panel)).toEqual(['missing', 'error']);

    await filter.fill('/stock\\/[12]$/');
    await expect.poll(() => rowNames(panel)).toEqual(['1', '2']);

    await filter.fill('');
    await panel.getByTestId('chip-4xx').click();
    await expect.poll(() => rowNames(panel)).toEqual(['missing']);
    await panel.getByTestId('chip-5xx').click();
    await expect.poll(() => rowNames(panel)).toEqual(['missing', 'error']);
  });

  test('column headers sort ascending, descending, then back to capture order; Timestamp shows the start time', async ({ openInspector }) => {
    const { panel } = await loadAll(openInspector);
    const captured = await rowNames(panel);
    await expect(panel.getByTestId('request-row').first().locator('td.timestamp')).toHaveText(/^\d\d:\d\d:\d\d\.\d{3}$/);

    await panel.getByTestId('sort-name').click();
    await expect.poll(() => rowNames(panel)).toEqual([...captured].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })));
    await panel.getByTestId('sort-name').click();
    await expect.poll(() => rowNames(panel)).toEqual([...captured].sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' })));
    await expect(panel.getByTestId('sort-name').locator('..')).toHaveAttribute('aria-sort', 'descending');
    await panel.getByTestId('sort-name').click();
    await expect.poll(() => rowNames(panel)).toEqual(captured);

    await panel.getByTestId('sort-method').click();
    await panel.getByTestId('sort-method').click();
    await expect(panel.getByTestId('request-row').first()).toContainText('cart');
  });

  test('the settings button opens the options page in a tab', async ({ openInspector, context }) => {
    const { panel } = await openInspector();
    const opened = context.waitForEvent('page');
    await panel.getByTestId('settings').click();
    expect((await opened).url()).toMatch(/\/options\.html$/);
  });

  test('filter autocomplete completes property keys', async ({ openInspector }) => {
    const { panel } = await openInspector();
    const filter = panel.getByTestId('filter');
    await filter.fill('api sta');
    await expect(panel.locator('.suggestions li')).toHaveText(['status-code:']);
    await filter.press('Tab');
    await expect(filter).toHaveValue('api status-code:');
  });

  test('include descendants toggles subtree requests', async ({ openInspector }) => {
    const { panel } = await loadAll(openInspector);
    await panel.getByTestId('node-ShopComponent').click();
    // Exact list: a length check can pass on the stale "All requests" table before it re-renders.
    await expect
      .poll(async () => (await rowNames(panel)).sort())
      .toEqual(['1', '2', '3', 'cart', 'error', 'legacy?format=xml', 'missing', 'products?page=1']);
    await panel.getByText('Include descendants').click();
    await expect.poll(() => rowNames(panel)).toEqual([]);
  });

  test('pause stops recording; clear empties the table', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    await expect.poll(async () => (await rowNames(panel)).length).toBeGreaterThan(5);
    await panel.getByTestId('record').click();
    await app.click('#add-to-cart');
    await app.waitForTimeout(500);
    expect(await rowNames(panel)).not.toContain('cart');
    await panel.getByTestId('record').click();
    await panel.getByTestId('clear').click();
    await expect.poll(() => rowNames(panel)).toEqual([]);
    await app.click('#add-to-cart');
    await expect.poll(() => rowNames(panel)).toEqual(['cart']);
  });

  test('requests made before the panel opened are in the snapshot (page-side buffer)', async ({ context, extensionId, openInspector }) => {
    const { panel } = await openInspector();
    await expect.poll(() => rowNames(panel)).toContain('config');
    // Reopen the panel: everything comes back from the hook's ring buffer.
    const url = panel.url();
    await panel.close();
    const again = await context.newPage();
    await again.goto(url);
    await expect.poll(() => rowNames(again)).toContain('products?page=1');
    expect(extensionId).toBeTruthy();
  });

  test('export HAR downloads entries with the _angular field, masked', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    await app.click('#add-to-cart');
    await panel.getByTestId('filter').fill('method:POST');
    await expect.poll(() => rowNames(panel)).toEqual(['cart']);
    const [download] = await Promise.all([panel.waitForEvent('download'), panel.getByTestId('export-menu').click().then(() => panel.getByTestId('export-har').click())]);
    const har = JSON.parse(await streamText(await download.createReadStream()));
    expect(har.log.entries).toHaveLength(1);
    expect(har.log.entries[0]._angular).toMatchObject({ component: 'CartComponent', confidence: 'context' });
    expect(JSON.stringify(har)).not.toContain('demo-secret-token');
  });

  test('picker selects the component under the clicked element', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    await expect(panel.getByTestId('node-CartComponent')).toHaveCount(1);
    await panel.getByTestId('picker').click();
    await app.waitForTimeout(200);
    await app.click('#add-to-cart');
    await expect(panel.getByTestId('node-CartComponent')).toHaveClass(/selected/);
    await expect(panel.locator('.inputs')).toHaveCount(0);
    await panel.getByTestId('node-ProductCardComponent').first().click();
    await expect(panel.locator('.inputs')).toContainText('product: {id: 1, name: "Shoes", price: 80}');
  });
});

async function streamText(stream: NodeJS.ReadableStream): Promise<string> {
  let text = '';
  for await (const chunk of stream) text += chunk.toString();
  return text;
}
