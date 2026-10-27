import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const rows = (panel: Page) => panel.getByTestId('request-row');

async function select(panel: Page, name: string): Promise<void> {
  await rows(panel).filter({ hasText: name }).first().click();
}

test.describe('tokens', () => {
  test('decodes a token returned in a response body', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/auth');
    await app.click('#login');
    await expect(rows(panel).filter({ hasText: 'login' })).toHaveCount(1);
    await select(panel, 'login');

    await expect(panel.getByTestId('tokens-count')).toHaveText('1');
    await panel.getByTestId('tab-tokens').click();
    await expect(panel.getByTestId('token-location')).toHaveText('response.access_token');
    await expect(panel.getByTestId('token-claim').filter({ hasText: 'sub' })).toContainText('ada');
    await expect(panel.getByTestId('token-expiry')).toContainText('expires in');
  });

  test('keeps a Bearer token hidden until revealed, then decodes it', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/auth');
    await app.click('#login');
    await expect(rows(panel).filter({ hasText: 'login' })).toHaveCount(1);
    await app.click('#call-bearer');
    await expect(rows(panel).filter({ hasText: 'me' })).toHaveCount(1);
    await select(panel, 'me');

    await panel.getByTestId('tab-tokens').click();
    await expect(panel.getByTestId('token-location')).toHaveText(/authorization header/i);
    await expect(panel.getByTestId('token-claim')).toHaveCount(0);
    await panel.getByTestId('token-hidden').click();
    await expect(panel.getByTestId('token-claim').filter({ hasText: 'name' })).toContainText('Ada');
  });

  test('decodes a token in the query string immediately', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/auth');
    await app.click('#login');
    await expect(rows(panel).filter({ hasText: 'login' })).toHaveCount(1);
    await app.click('#call-query');
    await expect(rows(panel).filter({ hasText: 'session' })).toHaveCount(1);
    await select(panel, 'session');

    await panel.getByTestId('tab-tokens').click();
    await expect(panel.getByTestId('token-location')).toHaveText('?token=');
    await expect(panel.getByTestId('token-hidden')).toHaveCount(0);
    await expect(panel.getByTestId('token-claim').filter({ hasText: 'sub' })).toContainText('ada');
  });

  test('marks a token that was already expired when the request was sent', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/auth');
    await app.click('#call-expired');
    await expect(rows(panel).filter({ hasText: 'expired' })).toHaveCount(1);
    await select(panel, 'expired');

    await panel.getByTestId('tab-tokens').click();
    await panel.getByTestId('token-hidden').click();
    await expect(panel.getByTestId('token-expiry')).toContainText('expired');
    await expect(panel.getByTestId('token-expired-at-send')).toBeVisible();
  });

  test('disables the tab when the request carries no token', async ({ openInspector }) => {
    const { panel } = await openInspector('/auth');
    await expect(rows(panel).filter({ hasText: 'config' })).toHaveCount(1);
    await select(panel, 'config');
    await expect(panel.getByTestId('tab-tokens')).toBeDisabled();
  });
});
