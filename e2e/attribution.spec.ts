import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** Selects the request row whose Name cell is exactly `name` and returns its Initiator tab text. */
async function initiatorOf(panel: Page, name: string): Promise<string> {
  const row = panel.getByTestId('request-row').filter({ has: panel.locator('td.name .url', { hasText: new RegExp(`^${escape(name)}$`) }) });
  await row.first().click();
  await panel.getByTestId('tab-initiator').click();
  return (await panel.getByTestId('initiator').innerText()).replace(/\s+/g, ' ');
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rows = (panel: Page) => panel.getByTestId('request-row');
const rowNames = (panel: Page) => rows(panel).locator('td.name .url').allInnerTexts();

test.describe('attribution scenarios (demo-app)', () => {
  test('builds the component tree with one node per instance', async ({ openInspector }) => {
    const { panel } = await openInspector();
    await expect(panel.getByTestId('node-ProductCardComponent')).toHaveCount(3);
    for (const name of ['App', 'BannerComponent', 'ShopComponent', 'SearchComponent', 'ProductListComponent', 'CartComponent']) {
      await expect(panel.getByTestId(`node-${name}`)).toHaveCount(1);
    }
    await expect(panel.locator('.info')).toContainText('dev mode · zone.js');
  });

  test('sync ngOnInit request belongs to the component (lifecycle context)', async ({ openInspector }) => {
    const { panel } = await openInspector();
    await expect(rows(panel).filter({ hasText: 'products?page=1' })).toHaveCount(1);
    const initiator = await initiatorOf(panel, 'products?page=1');
    expect(initiator).toContain('Owner Component ProductListComponent');
    expect(initiator).toContain('context (lifecycle)');
    await expect(panel.getByTestId('call-chain')).toHaveText('ProductListComponent → ProductService → HttpClient');
  });

  test('each instance of a repeated component owns only its own request', async ({ openInspector }) => {
    const { panel } = await openInspector();
    const cards = panel.getByTestId('node-ProductCardComponent');
    await expect(cards.nth(2).getByTestId('badge')).toHaveText('1');
    await cards.nth(1).click();
    await expect.poll(() => rowNames(panel)).toEqual(['2']);
    expect(await initiatorOf(panel, '2')).toContain('context (lifecycle)');
  });

  test('debounced search keeps its owner across the async gap', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    await app.fill('#search', 'ha');
    await expect(rows(panel).filter({ hasText: 'search?q=ha' })).toHaveCount(1);
    const initiator = await initiatorOf(panel, 'search?q=ha');
    expect(initiator).toContain('Owner Component SearchComponent');
    expect(initiator).toContain('context (async)');
  });

  test('click listener fetch() is attributed, with masked Authorization and JSON payload', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    await app.click('#add-to-cart');
    await expect(rows(panel).filter({ hasText: 'cart' })).toHaveCount(1);
    const initiator = await initiatorOf(panel, 'cart');
    expect(initiator).toContain('Owner Component CartComponent');
    expect(initiator).toContain('context (listener)');

    await panel.getByTestId('tab-headers').click();
    const detail = panel.getByTestId('detail');
    await expect(detail).toContainText('authorization');
    await expect(detail).not.toContainText('demo-secret-token');
    await detail.getByText('(click to reveal)').first().click();
    await expect(detail).toContainText('Bearer demo-secret-token');

    await panel.getByTestId('tab-payload').click();
    await expect(detail).toContainText('"productId": 2');
  });

  test('setTimeout → raw XHR keeps the owner from ngOnInit', async ({ openInspector }) => {
    const { panel } = await openInspector();
    await expect(rows(panel).filter({ hasText: 'legacy?format=xml' })).toHaveCount(1);
    const initiator = await initiatorOf(panel, 'legacy?format=xml');
    expect(initiator).toContain('Owner Component LegacyWidgetComponent');
    expect(initiator).toContain('context (async)');
    await expect(panel.getByTestId('call-chain')).toHaveText('LegacyWidgetComponent → XMLHttpRequest');
  });

  test('constructor request is attributed from the stack', async ({ openInspector }) => {
    const { panel } = await openInspector();
    const initiator = await initiatorOf(panel, 'banner');
    expect(initiator).toContain('Owner Component BannerComponent');
    expect(initiator).toContain('stack (stack)');
  });

  test('APP_INITIALIZER request lands in the Unattributed bucket', async ({ openInspector }) => {
    const { panel } = await openInspector();
    await panel.getByTestId('tree-unattributed').click();
    await expect.poll(() => rowNames(panel)).toEqual(['config', 'notifications']);
    expect(await initiatorOf(panel, 'config')).toContain('Confidence none');
  });

  test('route param switchMap is attributed, and the left page becomes Ghost Nodes', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    await expect(panel.getByTestId('node-ShopComponent')).toHaveCount(1);
    await app.click('#go-product-2');
    await expect(panel.getByTestId('node-ProductDetailComponent')).toHaveCount(1);
    await expect(panel.getByTestId('node-ShopComponent')).toHaveClass(/ghost/);
    await panel.getByTestId('node-ProductDetailComponent').click();
    await expect.poll(() => rowNames(panel)).toEqual(['2']);
    expect(await initiatorOf(panel, '2')).toContain('Owner Component ProductDetailComponent');
    // Ghost Nodes keep their requests selectable.
    await panel.getByTestId('node-ProductListComponent').click();
    await expect.poll(() => rowNames(panel)).toContain('products?page=1');
  });
});
