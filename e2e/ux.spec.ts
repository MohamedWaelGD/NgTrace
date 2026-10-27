import type { Page } from '@playwright/test';
import { DEMO_ZONELESS, expect, test } from './fixtures';

const rows = (panel: Page) => panel.getByTestId('request-row');

/** Records clipboard writes instead of touching the real clipboard. */
async function captureClipboard(panel: Page): Promise<() => Promise<string[]>> {
  await panel.evaluate(() => {
    const copied: string[] = [];
    (window as unknown as { __copied: string[] }).__copied = copied;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => void copied.push(t) } });
  });
  return () => panel.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
}

async function selectRequest(panel: Page, name: string): Promise<void> {
  await rows(panel).filter({ has: panel.locator('td.name .url', { hasText: new RegExp(`^${name}$`) }) }).first().click();
}

test.describe('Live Values', () => {
  for (const [label, origin] of [['zone.js', undefined], ['zoneless', DEMO_ZONELESS]] as const) {
    test(`selected component state updates without refresh (${label})`, async ({ openInspector }) => {
      const { app, panel } = await openInspector('/', origin);
      await panel.getByTestId('node-CartComponent').click();
      const state = panel.getByTestId('state');
      await expect(state).toContainText('status: Signal("")');
      await app.click('#add-to-cart');
      await expect(state).toContainText(/status: Signal\("\d{3}"\)/);
    });
  }

  test('changed rows flash', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    await panel.getByTestId('node-CartComponent').click();
    await expect(panel.getByTestId('state')).toContainText('status: Signal("")');
    await app.click('#add-to-cart');
    await expect(panel.getByTestId('state').locator('.row.flash', { hasText: 'status:' })).toHaveCount(1);
  });

  test('pausing Recording freezes values; refresh still reads them', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    await panel.getByTestId('node-CartComponent').click();
    const state = panel.getByTestId('state');
    await expect(state).toContainText('status: Signal("")');
    await panel.getByTestId('record').click();
    await app.click('#add-to-cart');
    await app.waitForTimeout(800);
    await expect(state).toContainText('status: Signal("")');
    await panel.getByTestId('refresh-details').click();
    await expect(state).toContainText(/status: Signal\("\d{3}"\)/);
  });

  test('a destroyed component keeps its last known values', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    await panel.getByTestId('node-CartComponent').click();
    await expect(panel.getByTestId('state')).toContainText('status: Signal("")');
    await app.click('#go-product-2');
    await expect(panel.getByTestId('destroyed-note')).toBeVisible();
    await expect(panel.getByTestId('state')).toContainText('status: Signal("")');
  });
});

test.describe('panel layout', () => {
  test('pane splitters resize and remember their size', async ({ context, openInspector }) => {
    const { panel } = await openInspector();
    const tree = panel.locator('.tree-pane');
    const before = (await tree.boundingBox())!.width;
    const handle = (await panel.getByTestId('splitter-tree').boundingBox())!;
    await panel.mouse.move(handle.x + 2, handle.y + 100);
    await panel.mouse.down();
    await panel.mouse.move(handle.x + 122, handle.y + 100, { steps: 5 });
    await panel.mouse.up();
    const after = (await tree.boundingBox())!.width;
    expect(Math.round(after - before)).toBe(120);

    const again = await context.newPage();
    await again.goto(panel.url());
    await expect.poll(async () => Math.round((await again.locator('.tree-pane').boundingBox())!.width)).toBe(Math.round(after));
    await again.getByTestId('splitter-tree').dblclick();
    await expect.poll(async () => Math.round((await again.locator('.tree-pane').boundingBox())!.width)).toBe(Math.round(before));
  });

  test('picking an element scrolls its component into view and names the element', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    await panel.setViewportSize({ width: 1100, height: 260 });
    await expect(panel.getByTestId('node-LegacyWidgetComponent')).toHaveCount(1);
    const tree = panel.locator('.tree');
    await panel.getByTestId('picker').click();
    await app.waitForTimeout(200);
    await app.click('#load-broken');
    const row = panel.getByTestId('node-LegacyWidgetComponent');
    await expect(row).toHaveClass(/selected/);
    await expect(row.getByTestId('picked-from')).toHaveText('from <button#load-broken>');
    await expect
      .poll(async () => {
        const r = (await row.boundingBox())!;
        const t = (await tree.boundingBox())!;
        return r.y >= t.y && r.y + r.height <= t.y + t.height;
      })
      .toBe(true);
  });
});

test.describe('picker', () => {
  test('a plain element selects its component; a visible row does not scroll', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    await expect(panel.getByTestId('node-ProductCardComponent')).toHaveCount(3);
    const tree = panel.locator('.tree');
    const scrollBefore = await tree.evaluate((el) => el.scrollTop);
    await panel.getByTestId('picker').click();
    await app.waitForTimeout(200);
    await app.locator('app-product-card .card').first().click();
    const row = panel.getByTestId('node-ProductCardComponent').first();
    await expect(row).toHaveClass(/selected/);
    await expect(row.getByTestId('picked-from')).toHaveText('from <div.card>');
    expect(await tree.evaluate((el) => el.scrollTop)).toBe(scrollBefore);
  });
});

test.describe('header copy', () => {
  test('a header row copies the raw value even when masked; cURL stays masked', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    const copied = await captureClipboard(panel);
    await app.click('#add-to-cart');
    await selectRequest(panel, 'cart');
    const row = panel.getByTestId('detail').locator('.kv', { has: panel.getByTestId('copy-header-req-authorization') });
    await row.hover();
    await panel.getByTestId('copy-header-req-authorization').click();
    await expect(panel.locator('.copied')).toHaveText(/^Copied authorization \(unmasked\)$/i);
    await panel.getByTestId('copy-menu').click();
    await panel.getByTestId('copy-curl').click();
    await expect.poll(copied).toHaveLength(2);
    const [header, curl] = await copied();
    expect(header).toBe('Bearer demo-secret-token');
    expect(curl).not.toContain('demo-secret-token');
  });

  test('Quick-copy button shows only on requests with the header', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    const copied = await captureClipboard(panel);
    await app.click('#add-to-cart');
    await selectRequest(panel, 'cart');
    await panel.getByTestId('copy-menu').click();
    await panel.getByTestId('quick-copy-authorization').click();
    await expect.poll(copied).toEqual(['Bearer demo-secret-token']);
    await selectRequest(panel, 'config');
    await panel.getByTestId('copy-menu').click();
    await expect(panel.getByTestId('copy-curl')).toBeVisible();
    await expect(panel.getByTestId('quick-copy-authorization')).toHaveCount(0);
  });

  test('toolbar copies the header from the latest request; disabled after Clear', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    const copied = await captureClipboard(panel);
    await app.click('#add-to-cart');
    await expect(rows(panel).filter({ hasText: 'cart' })).toHaveCount(1);
    await panel.getByTestId('quick-copy-menu').click();
    await panel.getByTestId('quick-copy-latest-authorization').click();
    await expect.poll(copied).toEqual(['Bearer demo-secret-token']);
    await panel.getByTestId('clear').click();
    await panel.getByTestId('quick-copy-menu').click();
    await expect(panel.getByTestId('quick-copy-latest-authorization')).toBeDisabled();
  });
});
