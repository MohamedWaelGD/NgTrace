import { expect, test } from './fixtures';

test.describe('value history', () => {
  test('scrubbing to a request marker shows the values from before it was sent; Back to live returns', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/resources');
    await panel.getByTestId('node-ResourcesComponent').click();
    const id = panel.getByTestId('signal-id');
    await expect(id).toContainText(': 1');

    // Changes `id`, which makes the resources send new requests.
    await app.click('#next-product');
    await expect(id).toContainText(': 2');
    await expect(panel.getByTestId('history-bar')).toHaveCount(0);

    await panel.getByTestId('history-marker').last().click();
    await expect(panel.getByTestId('history-bar')).toContainText('Viewing history');
    await expect(id).toContainText(': 1');
    // Scrubbing does not pause Recording.
    await expect(panel.getByTestId('record')).toHaveClass(/on/);

    await panel.getByTestId('history-back').click();
    await expect(panel.getByTestId('history-bar')).toHaveCount(0);
    await expect(id).toContainText(': 2');
  });

  test('selecting a request of the selected component moves the scrubber to just before it', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/resources');
    await panel.getByTestId('node-ResourcesComponent').click();
    await expect(panel.getByTestId('signal-id')).toContainText(': 1');
    await app.click('#next-product');
    await expect(panel.getByTestId('signal-id')).toContainText(': 2');

    await panel.getByTestId('request-row').filter({ has: panel.locator('td.name .url', { hasText: /^2$/ }) }).first().click();
    await expect(panel.getByTestId('history-bar')).toBeVisible();
    await expect(panel.getByTestId('signal-id')).toContainText(': 1');
  });
});
