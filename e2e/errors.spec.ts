import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const rows = (panel: Page) => panel.getByTestId('request-row');
const rowNames = (panel: Page) => rows(panel).locator('td.name .url').allInnerTexts();

test.describe('error and retry insight', () => {
  test('a service-level retry(2) shows Attempt 2 and Recovered, linked in the drawer', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/errors');
    await app.click('#fire-flaky');
    const flaky = rows(panel).filter({ hasText: 'flaky' });
    await expect(flaky).toHaveCount(2);
    await expect(flaky.first().getByTestId('failed-badge')).toHaveText('Failed 503');
    await expect(flaky.nth(1).getByTestId('attempt-badge')).toHaveText('Attempt 2');
    await expect(flaky.nth(1).getByTestId('recovered-badge')).toHaveText('Recovered');
    // A Retry is not Waste.
    await expect(flaky.getByTestId('waste-badge')).toHaveCount(0);

    await flaky.nth(1).click();
    await expect(panel.getByTestId('retry-chain')).toContainText('Attempt 1 (503) → Attempt 2 (200)');
    await panel.getByTestId('retry-attempt').first().click();
    await expect(flaky.first()).toHaveClass(/selected/);
  });

  test('a failing request gets a Failed badge, the filter narrows to failures, and the summary lists the owner', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/errors');
    await app.click('#fire-error');
    const failing = rows(panel).filter({ has: panel.locator('td.name .url', { hasText: /^error$/ }) });
    await expect(failing.getByTestId('failed-badge')).toHaveText('Failed 500');
    await expect.poll(async () => (await rowNames(panel)).length).toBeGreaterThan(1);

    await panel.getByTestId('chip-failed-only').click();
    await expect.poll(() => rowNames(panel)).toEqual([expect.stringContaining('error')]);
    await panel.getByTestId('view-timeline').click();
    await expect(panel.getByTestId('timeline-row')).toHaveCount(1);
    await panel.getByTestId('view-timeline').click();

    await panel.getByTestId('failures-toggle').click();
    await expect(panel.getByTestId('failure-row')).toContainText(['ErrorsComponent']);
    await expect(panel.getByTestId('failure-row').first()).toContainText('1 failed');
    await expect(panel.getByTestId('node-ErrorsComponent').getByTestId('failed-count')).toHaveText('1 failed');
  });
});
