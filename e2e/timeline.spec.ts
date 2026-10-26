import { expect, test } from './fixtures';

test.describe('timeline', () => {
  test('shows a bar per visible request and selects the request when a row is clicked', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/waste');
    await app.click('#fire-duplicates');
    await panel.getByTestId('filter').fill('products/1');
    await expect(panel.getByTestId('request-row')).toHaveCount(2);

    await panel.getByTestId('view-timeline').click();
    await expect(panel.getByTestId('timeline-bar')).toHaveCount(2);

    await panel.getByTestId('timeline-row').first().click();
    await expect(panel.locator('app-request-detail')).toBeVisible();
  });

  test('shares the table filters', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/waste');
    await app.click('#fire-duplicates');
    await app.click('#fire-cancel');
    await panel.getByTestId('view-timeline').click();
    await panel.getByTestId('filter').fill('slow');
    await expect(panel.getByTestId('timeline-row')).toHaveCount(2);
    await expect(panel.getByTestId('timeline-row').first()).toContainText('slow');
  });

  test('marks router navigations and the route-phase bands, and fits the latest navigation', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/');
    await app.click('#go-store-3');
    await panel.getByTestId('view-timeline').click();
    await expect(panel.getByTestId('timeline-marker').first()).toBeAttached();
    await expect(panel.getByTestId('timeline-band').first()).toBeAttached();
    await panel.getByTestId('timeline-fit-nav').click();
    await expect(panel.getByTestId('timeline-bar').first()).toBeVisible();
  });

  test('wheel zoom changes the time axis', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/waste');
    await app.click('#fire-duplicates');
    await panel.getByTestId('view-timeline').click();
    const ticks = panel.locator('.tick');
    const before = await ticks.nth(1).innerText();
    await panel.getByTestId('timeline-row').first().locator('.track').hover();
    await panel.mouse.wheel(0, -300);
    await expect(ticks.nth(1)).not.toHaveText(before);
  });
});
