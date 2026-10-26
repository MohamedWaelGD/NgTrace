import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const rows = (panel: Page) => panel.getByTestId('request-row');
const named = (panel: Page, name: string) => rows(panel).filter({ has: panel.locator('td.name .url', { hasText: new RegExp(`^${name}$`) }) });

test.describe('interceptor chain', () => {
  test('the auth interceptor adds a masked Authorization header and the cache interceptor short-circuits a repeat', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/interceptors');
    await app.click('#load-profile');
    await expect(named(panel, 'profile')).toHaveCount(1);
    await app.click('#load-profile');
    await expect(named(panel, 'profile')).toHaveCount(2);

    await named(panel, 'profile').first().click();
    await panel.getByTestId('tab-interceptors').click();
    const steps = panel.getByTestId('interceptor-step');
    await expect(steps.getByTestId('interceptor-name')).toHaveText(['xsrfInterceptorFn', 'authInterceptor', 'cacheInterceptor', 'retryInterceptor']);
    const auth = steps.nth(1);
    await expect(auth.getByTestId('diff-added')).toHaveText('+ Authorization: ••••••');
    await expect(auth).not.toContainText('demo-profile-token');

    await named(panel, 'profile').nth(1).click();
    await expect(panel.getByTestId('interceptor-step').getByTestId('interceptor-name')).toHaveText(['xsrfInterceptorFn', 'authInterceptor', 'cacheInterceptor']);
    await expect(panel.getByTestId('interceptor-step').nth(2).getByTestId('short-circuit')).toBeVisible();
    await panel.getByTestId('tab-headers').click();
    await expect(panel.getByTestId('short-circuit-note')).toContainText('cacheInterceptor');
  });

  test('a retry inside an interceptor shows as attempt 2 and is counted on its step', async ({ openInspector }) => {
    const { app, panel } = await openInspector('/interceptors');
    await app.click('#load-unstable');
    const unstable = rows(panel).filter({ hasText: 'unstable' });
    await expect(unstable).toHaveCount(2);
    await expect(unstable.nth(1).getByTestId('attempt-badge')).toHaveText('Attempt 2');
    await unstable.nth(1).click();
    await panel.getByTestId('tab-interceptors').click();
    await expect(panel.getByTestId('interceptor-retries')).toContainText('1 retry');
  });
});
