import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const rows = (panel: Page) => panel.getByTestId('request-row');

async function streamText(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function exportAs(panel: Page, testId: string): Promise<string> {
  await panel.getByTestId('filter').fill('method:POST');
  await expect(rows(panel)).toHaveCount(1);
  await panel.getByTestId('export-menu').click();
  const [download] = await Promise.all([panel.waitForEvent('download'), panel.getByTestId(testId).click()]);
  return streamText((await download.createReadStream())!);
}

test.describe('export to code and tools', () => {
  test('exports a Postman collection with a folder per Owner Component', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    await app.click('#add-to-cart');
    const collection = JSON.parse(await exportAs(panel, 'export-postman'));
    expect(collection.info.schema).toContain('v2.1.0');
    expect(collection.item.map((f: { name: string }) => f.name)).toEqual(['CartComponent']);
    expect(collection.item[0].item[0]).toMatchObject({ name: 'POST /api/cart', request: { method: 'POST' } });
    expect(JSON.stringify(collection)).not.toContain('demo-secret-token');
  });

  test('exports a Playwright stub for the visible requests', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    await app.click('#add-to-cart');
    const code = await exportAs(panel, 'export-playwright');
    expect(code).toContain("import { test } from '@playwright/test';");
    expect(code).toContain('// CartComponent: POST http://localhost:4321/api/cart');
    expect(code).toContain('page.route("http://localhost:4321/api/cart"');
  });

  test('exports a Cypress stub for the visible requests', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    await app.click('#add-to-cart');
    const code = await exportAs(panel, 'export-cypress');
    expect(code).toContain('cy.intercept({ method: "POST", url: "http://localhost:4321/api/cart" }');
    expect(code).toContain('statusCode: 201');
  });

  test('copies a stub for the selected request', async ({ openInspector }) => {
    const { app, panel } = await openInspector();
    await app.click('#add-to-cart');
    await panel.evaluate(() => {
      const copied: string[] = [];
      (window as unknown as { __copied: string[] }).__copied = copied;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => void copied.push(t) } });
    });
    await rows(panel).filter({ has: panel.locator('td.name .url', { hasText: /^\s*cart\s*$/ }) }).first().click();
    await panel.getByTestId('copy-menu').click();
    await panel.getByTestId('copy-playwright').click();
    const [copied] = await panel.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
    expect(copied).toContain('page.route(');
    expect(copied).toContain('"content-type": "application/json"');
  });
});
