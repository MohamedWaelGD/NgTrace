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

  test('ctrl+wheel zooms and the axis labels follow; a plain wheel does not zoom', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/waste');
    await app.click('#fire-duplicates');
    await panel.getByTestId('view-timeline').click();
    const ticks = () => panel.locator('.tick').allInnerTexts();
    const before = await ticks();
    const track = panel.getByTestId('timeline-row').first().locator('.track');
    await track.hover();
    await panel.mouse.wheel(0, -300);
    expect(await ticks()).toEqual(before);

    await panel.keyboard.down('Control');
    await panel.mouse.wheel(0, -300);
    await panel.keyboard.up('Control');
    await expect.poll(ticks).not.toEqual(before);
  });

  test('shift+wheel and the scrollbar move through time, and the axis labels move with them', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/waste');
    await app.click('#fire-duplicates');
    await panel.getByTestId('view-timeline').click();
    const ticks = () => panel.locator('.tick').allInnerTexts();
    const track = panel.getByTestId('timeline-row').first().locator('.track');
    await track.hover();
    // Zoom in first, so there is something to scroll to.
    await panel.keyboard.down('Control');
    await panel.mouse.wheel(0, -600);
    await panel.keyboard.up('Control');
    const zoomed = await ticks();

    await panel.keyboard.down('Shift');
    await panel.mouse.wheel(0, 200);
    await panel.keyboard.up('Shift');
    await expect.poll(ticks).not.toEqual(zoomed);

    const moved = await ticks();
    const bar = (await panel.getByTestId('timeline-scrollbar').boundingBox())!;
    const thumb = (await panel.getByTestId('timeline-thumb').boundingBox())!;
    // Click the bar on the side away from the thumb, so the view has to move.
    const x = thumb.x - bar.x > bar.width - (thumb.x - bar.x + thumb.width) ? bar.x + 2 : bar.x + bar.width - 2;
    await panel.mouse.click(x, bar.y + bar.height / 2);
    await expect.poll(ticks).not.toEqual(moved);
  });

  test('going back to following the data after navigating', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/waste');
    await app.click('#fire-duplicates');
    await panel.getByTestId('view-timeline').click();
    await panel.getByTestId('timeline-row').first().locator('.track').hover();
    await panel.keyboard.down('Control');
    await panel.mouse.wheel(0, -600);
    await panel.keyboard.up('Control');
    await app.reload();
    await expect(panel.getByTestId('timeline-bar').first()).toBeVisible();
    const bar = (await panel.getByTestId('timeline-scrollbar').boundingBox())!;
    await expect.poll(async () => (await panel.getByTestId('timeline-thumb').boundingBox())!.width).toBeCloseTo(bar.width, -1);
  });
});
