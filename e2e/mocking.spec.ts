import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const rows = (panel: Page) => panel.getByTestId('request-row');
const row = (panel: Page, name: string) =>
  rows(panel).filter({ has: panel.locator('td.name', { hasText: new RegExp(`^\\s*(Mocked)?\\s*${name}\\s*$`) }) }).first();

interface RuleInput {
  pattern: string;
  method?: string;
  component?: string;
  action?: 'respond' | 'error' | 'delay' | 'passthrough';
  status?: number;
  body?: string;
  delayMs?: number;
}

/** Adds a rule through the Mocks pane (the pane stays open for further rules). */
async function addRule(panel: Page, rule: RuleInput): Promise<void> {
  if (!(await panel.getByTestId('mocks-pane').isVisible())) await panel.getByTestId('mocks-toggle').click();
  await panel.getByTestId('mock-add').click();
  const card = panel.getByTestId('mock-rule').last();
  await card.getByTestId('mock-pattern').fill(rule.pattern);
  if (rule.method) await card.getByTestId('mock-method').selectOption(rule.method);
  if (rule.component) await card.getByTestId('mock-component').fill(rule.component);
  if (rule.action) await card.getByTestId('mock-action').selectOption(rule.action);
  if (rule.status) await card.getByTestId('mock-status').fill(String(rule.status));
  if (rule.body !== undefined) await card.getByTestId('mock-body').fill(rule.body);
  if (rule.delayMs) await card.getByTestId('mock-delay').fill(String(rule.delayMs));
}

test.describe('request mocking', () => {
  test('mocks a bootstrap request after reload, shows it as Mocked, and the app gets the canned response', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/');
    await expect(app.locator('app-product-card')).toHaveCount(3);

    await addRule(panel, { pattern: '/api/products', method: 'GET', status: 500, body: '{"error":"mocked"}' });
    await expect(panel.getByTestId('mocks-toggle')).toContainText('1 active');
    await app.reload();

    await expect(row(panel, 'products\\?page=1')).toContainText('Mocked');
    await expect(row(panel, 'products\\?page=1').locator('td.status')).toHaveText('500');
    // The component got the error instead of the list.
    await expect(app.locator('app-product-card')).toHaveCount(0);
    await row(panel, 'products\\?page=1').click();
    await expect(panel.getByTestId('mocked-note')).toBeVisible();
  });

  test('mocks the app-initializer request that runs before anything renders', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/');
    await addRule(panel, { pattern: '/api/config', status: 503, body: '{}' });
    await app.reload();
    await expect(row(panel, 'config')).toContainText('Mocked');
    await expect(row(panel, 'config').locator('td.status')).toHaveText('503');
  });

  test('a component-scoped rule leaves other components requests alone', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/');
    await addRule(panel, { pattern: '/api/*', component: 'ProductListComponent', status: 500, body: '{}' });
    await app.reload();
    await expect(panel.getByTestId('mocked-badge')).toHaveCount(1);
    await expect(row(panel, 'products\\?page=1')).toContainText('Mocked');
    await expect(row(panel, 'banner')).not.toContainText('Mocked');
  });

  test('a delay rule throttles the real response', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/');
    await addRule(panel, { pattern: '/api/banner', action: 'delay', delayMs: 1200 });
    await app.reload();
    await expect(row(panel, 'banner').locator('td.num').last()).toHaveText(/^1\.\d+ s$/, { timeout: 8000 });
    await expect(panel.getByTestId('mocked-badge')).toHaveCount(0);
  });

  test('"Mock this request…" prefills a rule from the request', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/');
    await row(panel, 'config').click();
    await panel.getByTestId('mock-this').click();
    const card = panel.getByTestId('mock-rule').last();
    await expect(card.getByTestId('mock-pattern')).toHaveValue('/api/config');
    await expect(card.getByTestId('mock-method')).toHaveValue('GET');
    await expect(card.getByTestId('mock-body')).toHaveValue('{"theme":"light"}');
    await card.getByTestId('mock-status').fill('418');
    await app.reload();
    await expect(row(panel, 'config').locator('td.status')).toHaveText('418');
    await expect(row(panel, 'config')).toContainText('Mocked');
  });

  test('a failing rule makes the request fail like a network error', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/');
    await addRule(panel, { pattern: '/api/banner', action: 'error' });
    await app.reload();
    await expect(row(panel, 'banner').locator('td.status')).toHaveText('(failed)');
    await expect(row(panel, 'banner')).toContainText('Mocked');
  });

  test('rules stop applying when the panel is closed', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/');
    await addRule(panel, { pattern: '/api/products', method: 'GET', status: 500, body: '{}' });
    await app.reload();
    await expect(app.locator('app-product-card')).toHaveCount(0);

    await panel.close();
    await app.waitForTimeout(500);
    await app.reload();
    await expect(app.locator('app-product-card')).toHaveCount(3);
  });

  test('rules are saved per origin and listed again when the panel reopens', async ({ openInspector, context, extensionId }) => {
    const { panel } = await openInspector('/');
    await addRule(panel, { pattern: '/api/saved' });
    await expect.poll(() => panel.evaluate(() => chrome.storage.local.get(null).then((o) => Object.keys(o)))).toContain('mocks:http://localhost:4321');
    await panel.close();
    const reopened = await context.newPage();
    await reopened.goto(`chrome-extension://${extensionId}/panel/index.html?tabId=${await tabOf(context, extensionId)}`);
    await reopened.getByTestId('mocks-toggle').click();
    await expect(reopened.getByTestId('mock-pattern')).toHaveValue('/api/saved');
  });
});

async function tabOf(context: import('@playwright/test').BrowserContext, extensionId: string): Promise<number> {
  const helper = await context.newPage();
  await helper.goto(`chrome-extension://${extensionId}/options.html`);
  const id = await helper.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'http://localhost:4321/*' });
    return tab.id!;
  });
  await helper.close();
  return id;
}

test.describe('request mocking while Recording is paused', () => {
  test('rules stay armed and the mocked request is still listed', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/');
    await addRule(panel, { pattern: '/api/products', method: 'GET', status: 500, body: '{}' });
    await panel.getByTestId('record').click();
    await app.reload();
    await expect(app.locator('app-product-card')).toHaveCount(0);
    await expect(row(panel, 'products\\?page=1')).toContainText('Mocked');
    // Nothing else was recorded while paused.
    await expect(rows(panel)).toHaveCount(1);
  });
});
