import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const rows = (panel: Page) => panel.getByTestId('request-row');
const rowNames = (panel: Page) => rows(panel).locator('td.name').allInnerTexts();

async function initiatorOf(panel: Page, name: string): Promise<string> {
  await rows(panel).filter({ has: panel.locator('td.name', { hasText: new RegExp(`^${name}$`) }) }).first().click();
  await panel.getByTestId('tab-initiator').click();
  return (await panel.getByTestId('initiator').innerText()).replace(/\s+/g, ' ');
}

test.describe('services, route resolvers and component state', () => {
  test('a resolver request is attributed to the routed component, with its Owner Service', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    await app.click('#go-store-3');
    await expect(app.locator('#store-product')).toHaveText('Scarf');
    await panel.getByTestId('node-StoreDetailComponent').click();
    await expect.poll(() => rowNames(panel)).toEqual(['3']);
    const initiator = await initiatorOf(panel, '3');
    expect(initiator).toContain('Owner Component StoreDetailComponent');
    expect(initiator).toContain('context (route)');
    expect(initiator).toContain('Owner Service ProductStore');
    expect(initiator).toContain('Route stores/:id (resolve)');
    await expect(panel.getByTestId('call-chain')).toHaveText('Route stores/:id → ProductStore → HttpClient');
  });

  test('injected services show where they come from, their requests and their state', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    await app.click('#go-store-3');
    await panel.getByTestId('node-StoreDetailComponent').click();

    const service = panel.getByTestId('service-ProductStore');
    await expect(service).toContainText('Route: stores/:id');
    await expect(service.locator('.badge')).toHaveText('1');

    await service.click();
    await expect(panel.getByTestId('service-title')).toContainText('ProductStore');
    await expect(panel.getByTestId('service-state')).toContainText('product: Signal({id: 3, name: "Scarf", price: 30})');
    await expect.poll(() => rowNames(panel)).toEqual(['3']);
  });

  test('component state is read-only and expandable, signals unwrapped', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    await app.click('#go-store-3');
    await panel.getByTestId('node-StoreDetailComponent').click();
    const state = panel.getByTestId('state');
    await expect(state).toContainText('title: "Store detail"');
    await expect(state).not.toContainText('__ngContext__');
    await state.locator('.row', { hasText: /^▸store:/ }).locator('.twisty').click();
    await expect(state).toContainText('loadedAt: Signal("');
    await state.locator('.row', { hasText: /^▸product:/ }).locator('.twisty').click();
    await expect(state).toContainText('name: "Scarf"');
  });

  test('injector path lists route providers, created ones marked', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    await app.click('#go-store-3');
    await panel.getByTestId('node-StoreDetailComponent').click();
    await panel.getByText('Injector path').click();
    const path = panel.getByTestId('injector-path');
    await expect(path.locator('summary')).toContainText(['<app-store-detail> StoreDetailComponent', 'Route: stores/:id', 'root', 'platform']);
    await path.getByTestId('injector-Route: stores/:id').click();
    await expect(path.locator('.provider', { hasText: 'ProductStore' }).locator('.dot')).toHaveClass(/created/);
  });

  test("a service's own requests show on the components that inject it", async ({ openInspector }) => {
    const { panel } = await openInspector();
    await panel.getByTestId('node-NotificationBadgeComponent').click();
    await expect.poll(() => rowNames(panel)).toEqual(['notifications']);
    expect(await initiatorOf(panel, 'notifications')).toContain('Owner Service NotificationService');
    await panel.getByTestId('include-services').click();
    await expect.poll(() => rowNames(panel)).toEqual([]);
  });

  test('a shared service does not pull in requests other components made', async ({ openInspector }) => {
    const { panel } = await openInspector();
    // CartComponent injects nothing; SearchComponent's ProductService calls belong to their callers.
    await panel.getByTestId('node-SearchComponent').click();
    await expect.poll(() => rowNames(panel)).toEqual([]);
  });

  test('service: filter', async ({ openInspector }) => {
    const { panel } = await openInspector();
    await panel.getByTestId('filter').fill('service:productservice');
    await expect.poll(() => rowNames(panel)).toEqual(['products?page=1', '1', '2', '3']);
  });
});
