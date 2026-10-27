import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const rows = (panel: Page) => panel.getByTestId('request-row');

async function select(panel: Page, name: string): Promise<void> {
  await rows(panel).filter({ has: panel.locator('td.name .url', { hasText: new RegExp(`^\s*${name}\s*$`) }) }).first().click();
}

async function loadDrift(openInspector: (path?: string) => Promise<{ app: Page; panel: Page }>) {
  const { app, panel } = await openInspector('/contract');
  await app.click('#load-drift');
  await expect(rows(panel).filter({ has: panel.locator('td.name .url', { hasText: /^\s*[123]\s*$/ }) })).toHaveCount(3);
  await select(panel, '1');
  await panel.getByTestId('tab-contract').click();
  return { app, panel };
}

test.describe('contract and drift', () => {
  test('groups calls with different ids into one Endpoint and flags Drift', async ({ openInspector }) => {
    const { panel } = await loadDrift(openInspector);
    await expect(panel.getByTestId('contract-endpoint')).toHaveText('GET /api/drift/:id');
    await expect(panel.getByTestId('contract-used')).toHaveText('from 3 responses');
    await expect(panel.getByTestId('drift-entry')).toHaveCount(3);
    await expect(panel.getByTestId('drift-entry').filter({ hasText: '$.price' })).toContainText('type');
    await expect(panel.getByTestId('drift-entry').filter({ hasText: '$.note' })).toContainText('optional');
    await expect(panel.getByTestId('drift-entry').filter({ hasText: '$.owner' })).toContainText('nullable');
    await expect(panel.getByTestId('contract-shape')).toContainText('price');
  });

  test('a Drift link selects the request that disagrees', async ({ openInspector }) => {
    const { panel } = await loadDrift(openInspector);
    const price = panel.getByTestId('drift-entry').filter({ hasText: '$.price' });
    // variants: string (request 1), number (requests 2 and 3); the first number link is request 2
    await price.getByTestId('drift-link').nth(1).click();
    await panel.getByTestId('tab-headers').click();
    await expect(panel.getByTestId('detail')).toContainText('/api/drift/2');
  });

  test('copies the Contract as TypeScript', async ({ openInspector }) => {
    const { panel } = await loadDrift(openInspector);
    await panel.evaluate(() => {
      const copied: string[] = [];
      (window as unknown as { __copied: string[] }).__copied = copied;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => void copied.push(t) } });
    });
    await panel.getByTestId('copy-typescript').click();
    const [ts] = await panel.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
    expect(ts).toContain('export interface Drift {');
    expect(ts).toContain('  price: string | number;');
    expect(ts).toContain('  owner: string | null;');
    expect(ts).toContain('  note?: string;');
    expect(ts).toContain('  items: DriftItem[];');
    expect(ts).toContain('export interface DriftItem {');
  });

  test('skips a response truncated at 1 MB and says so', async ({ openInspector }) => {
    const { app, panel } = await loadDrift(openInspector);
    await app.click('#load-big');
    await expect(rows(panel).filter({ has: panel.locator('td.name .url', { hasText: /^\s*4\s*$/ }) })).toHaveCount(1);
    await expect(panel.getByTestId('contract-skipped')).toContainText('Truncated, not inferred');
    await expect(panel.getByTestId('contract-used')).toHaveText('from 3 responses');
  });

  test('says there is no JSON body for an XML response', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/contract');
    await app.click('#load-xml');
    await expect(rows(panel).filter({ hasText: 'legacy' })).toHaveCount(1);
    await select(panel, 'legacy');
    await panel.getByTestId('tab-contract').click();
    await expect(panel.getByTestId('contract-empty')).toBeVisible();
    await expect(panel.getByTestId('contract-own-note')).toContainText('no json body');
  });
});
