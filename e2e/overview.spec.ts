import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const rowNames = (panel: Page) =>
  panel.getByTestId('request-row').locator('td.name .url').allInnerTexts();

test.describe('overview strip', () => {
  test('breaks traffic down by status; slices filter and totals jump', async ({
    openInspector,
  }) => {
    const { app, panel } = await openInspector();
    await app.click('#add-to-cart');
    await app.click('#load-broken');
    await expect.poll(async () => (await rowNames(panel)).length).toBe(11);

    const overview = panel.getByTestId('overview');
    await expect(overview.getByTestId('overview-total')).toHaveText('11 requests');
    await expect(overview.getByTestId('overview-key-4xx')).toContainText('1');
    await expect(overview.getByTestId('overview-key-5xx')).toContainText('1');
    await expect(overview.getByTestId('overview-failed')).toHaveText('2 failed');

    await overview.getByTestId('overview-slice-4xx').click();
    await expect.poll(() => rowNames(panel)).toEqual(['missing']);
    await expect(panel.getByTestId('chip-4xx')).toHaveClass(/active/);
    await expect(overview.getByTestId('overview-key-2xx')).toHaveClass(/dim/);
    await overview.getByTestId('overview-key-4xx').click();
    await expect.poll(async () => (await rowNames(panel)).length).toBe(11);

    await overview.getByTestId('overview-failed').click();
    await expect.poll(() => rowNames(panel)).toEqual(['missing', 'error']);
    await overview.getByTestId('overview-failed').click();

    await overview.getByTestId('overview-slowest').click();
    await expect(panel.getByTestId('request-row').and(panel.locator('.selected'))).toHaveCount(1);
  });

  test('optional strips all stay above the request panes', async ({ openInspector }) => {
    const { panel } = await openInspector();
    await panel.getByTestId('mocks-toggle').click();
    await panel.getByTestId('waste-toggle').click();
    await panel.getByTestId('failures-toggle').click();
    const top = async (id: string) => (await panel.getByTestId(id).boundingBox())!.y;
    const overview = await top('overview');
    for (const id of ['mocks-pane', 'waste-summary', 'failures-summary'])
      expect(await top(id)).toBeLessThan(overview);
  });
});
