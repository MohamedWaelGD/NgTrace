import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const rows = (panel: Page) => panel.getByTestId('request-row');

async function selectRequest(panel: Page, name: string): Promise<void> {
  await rows(panel).filter({ has: panel.locator('td.name .url', { hasText: new RegExp(`^\\s*${name}\\s*$`) }) }).first().click();
}

async function captureClipboard(panel: Page): Promise<() => Promise<string[]>> {
  await panel.evaluate(() => {
    const copied: string[] = [];
    (window as unknown as { __copied: string[] }).__copied = copied;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => void copied.push(t) } });
  });
  return () => panel.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
}

const PRETTY = JSON.stringify({ productId: 2, qty: 1 }, null, 2);

test.describe('replay and edit-and-resend', () => {
  test('replays a GET unchanged without asking, listing it directly under the original', async ({ openInspector }) => {
    const { panel } = await openInspector('/');
    await expect(rows(panel).filter({ hasText: 'config' })).toHaveCount(1);
    await selectRequest(panel, 'config');
    await panel.getByTestId('tab-replay').click();
    await panel.getByTestId('replay-button').click();

    await expect(panel.getByTestId('replay-badge')).toHaveCount(1);
    const names = await rows(panel).locator('td.name').allInnerTexts();
    const original = names.findIndex((n) => n.trim() === 'config');
    expect(names[original + 1]).toContain('Replay');
    await expect(panel.getByTestId('replay-diff')).toBeVisible();
    await expect(panel.getByTestId('diff-body')).toHaveText('Body unchanged.');
  });

  test('edit & resend a POST: asks first, then diffs the new response against the original', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/');
    await app.click('#add-to-cart');
    await selectRequest(panel, 'cart');
    await panel.getByTestId('tab-replay').click();
    await panel.getByTestId('edit-resend-button').click();
    await panel.getByTestId('replay-body').fill('{"productId":2,"qty":5}');
    await panel.getByTestId('replay-send').click();

    await expect(panel.getByTestId('replay-confirm')).toContainText('POST');
    await panel.getByTestId('replay-confirm-send').click();

    await expect(panel.getByTestId('replay-badge')).toHaveCount(1);
    await expect(panel.getByTestId('diff-body')).toContainText('$.received.qty');
    await expect(panel.getByTestId('diff-body')).toContainText('1');
    await expect(panel.getByTestId('diff-body')).toContainText('5');
  });

  test('sends the real value of a masked header unless it was edited', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/');
    await app.click('#add-to-cart');
    await selectRequest(panel, 'cart');
    await panel.getByTestId('tab-replay').click();
    await panel.getByTestId('replay-button').click();
    await panel.getByTestId('replay-confirm-send').click();
    await expect(panel.getByTestId('replay-badge')).toHaveCount(1);

    const copied = await captureClipboard(panel);
    await panel.getByTestId('request-row').filter({ has: panel.getByTestId('replay-badge') }).click();
    await panel.getByTestId('tab-headers').click();
    await panel.getByTestId('detail').locator('.kv', { has: panel.getByTestId('copy-header-req-authorization') }).hover();
    await panel.getByTestId('copy-header-req-authorization').click();
    await expect.poll(copied).toEqual(['Bearer demo-secret-token']);
  });

  test('"don\'t ask again" skips the confirmation for the rest of the session', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/');
    await app.click('#add-to-cart');
    await selectRequest(panel, 'cart');
    await panel.getByTestId('tab-replay').click();
    await panel.getByTestId('replay-button').click();
    await panel.getByTestId('replay-confirm').getByRole('checkbox').check();
    await panel.getByTestId('replay-confirm-send').click();
    await panel.getByTestId('replay-button').click();
    await expect(panel.getByTestId('replay-confirm')).toHaveCount(0);
    await expect(panel.getByTestId('replay-badge')).toHaveCount(2);
  });

  test('blocks a replay whose body was not captured, until a replacement body is supplied', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/');
    await app.evaluate(() => fetch('/api/error', { method: 'POST', body: new Blob([new Uint8Array([1, 2, 3])]) }));
    await expect(rows(panel).filter({ hasText: 'error' })).toHaveCount(1);
    await selectRequest(panel, 'error');
    await panel.getByTestId('tab-replay').click();
    await expect(panel.getByTestId('replay-blocked')).toContainText('binary');
    await expect(panel.getByTestId('replay-button')).toBeDisabled();
    await panel.getByTestId('edit-resend-button').click();
    await panel.getByTestId('replay-body').fill('{"qty":1}');
    await expect(panel.getByTestId('replay-send')).toBeEnabled();
  });

  test('Replay stays usable while the editor is open and asks for confirmation straight away', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/');
    await app.click('#add-to-cart');
    await selectRequest(panel, 'cart');
    await panel.getByTestId('tab-replay').click();
    await panel.getByTestId('edit-resend-button').click();
    await expect(panel.getByTestId('replay-button')).toBeEnabled();
    await panel.getByTestId('replay-button').click();
    await expect(panel.getByTestId('replay-confirm')).toBeVisible();
  });

  test('the editor stays open while live updates arrive for the request', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/');
    await app.click('#add-to-cart');
    await selectRequest(panel, 'cart');
    await panel.getByTestId('tab-replay').click();
    await panel.getByTestId('edit-resend-button').click();
    // Another request arriving updates the store; the open editor must not reset.
    await app.click('#add-to-cart');
    await expect(rows(panel).filter({ hasText: 'cart' })).toHaveCount(2);
    await expect(panel.getByTestId('replay-editor')).toBeVisible();
  });

  test('query parameters are editable rows, like headers', async ({ openInspector }) => {
    const { panel } = await openInspector('/');
    await expect(rows(panel).filter({ hasText: 'products?page=1' })).toHaveCount(1);
    await selectRequest(panel, 'products\\?page=1');
    await panel.getByTestId('tab-replay').click();
    await panel.getByTestId('edit-resend-button').click();
    await expect(panel.getByTestId('replay-url')).toHaveValue(/\/api\/products$/);
    await expect(panel.getByTestId('replay-query-name-0')).toHaveValue('page');
    await panel.getByTestId('replay-query-value-0').fill('2');
    await panel.getByTestId('replay-add-query').click();
    await panel.getByTestId('replay-query-name-1').fill('sort');
    await panel.getByTestId('replay-query-value-1').fill('asc');
    await panel.getByTestId('replay-send').click();
    await expect(rows(panel).filter({ hasText: 'products?page=2&sort=asc' })).toHaveCount(1);
  });

  test('the body opens formatted and can be minified, re-formatted, and flags invalid JSON', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/');
    await app.click('#add-to-cart');
    await selectRequest(panel, 'cart');
    await panel.getByTestId('tab-replay').click();
    await panel.getByTestId('edit-resend-button').click();
    const body = panel.getByTestId('replay-body');
    await expect(body).toHaveValue(PRETTY);
    await panel.getByTestId('replay-minify').click();
    await expect(body).toHaveValue('{"productId":2,"qty":1}');
    await panel.getByTestId('replay-format').click();
    await expect(body).toHaveValue(PRETTY);
    await body.fill('{"broken":');
    await panel.getByTestId('replay-format').click();
    await expect(panel.getByTestId('replay-body-error')).toBeVisible();
  });
});
