import { expect, test } from './fixtures';

test.describe('waste detector', () => {
  test('flags a duplicate GET and shows it in the summary', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/waste');
    await app.click('#fire-duplicates');
    await expect(panel.getByTestId('waste-badge')).toHaveText('Duplicate ×2');

    await panel.getByTestId('waste-toggle').click();
    await expect(panel.getByTestId('waste-row')).toContainText(['WasteComponent']);
    await expect(panel.getByTestId('waste-row')).toContainText('1 duplicate');
  });

  test('flags a request cancelled by switchMap and refired', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/waste');
    await app.click('#fire-cancel');
    await expect(panel.getByTestId('waste-badge')).toHaveText('Cancelled');
  });

  test('"Wasteful only" hides requests without a Waste Signal', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/waste');
    await app.click('#fire-duplicates');
    await expect(panel.getByTestId('request-row')).not.toHaveCount(1);
    await panel.getByTestId('chip-waste').click();
    await expect(panel.getByTestId('request-row')).toHaveCount(1);
  });
});
