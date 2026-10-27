import { chromium, test as base, type BrowserContext, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const extensionPath = resolve('dist/extension');
export const DEMO = 'http://localhost:4321';
export const DEMO_ZONELESS = 'http://localhost:4322';

/**
 * Branded Chrome ignores --load-extension since v137, and Playwright's bundled (unsigned) Chromium
 * may be blocked by app control. So we start Chrome ourselves and load the unpacked extension over
 * CDP (`Extensions.loadUnpacked`). Override the binary with E2E_CHROME.
 */
const chromePath = process.env['E2E_CHROME'] ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

interface Fixtures {
  context: BrowserContext;
  extensionId: string;
  /** Opens the demo app and the panel (as a page, bound to the demo tab via ?tabId=). */
  openInspector: (path?: string, origin?: string) => Promise<{ app: Page; panel: Page }>;
}

async function waitForDebugger(port: number): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Chrome did not start');
}

export const test = base.extend<Fixtures & { launched: { context: BrowserContext; extensionId: string } }>({
  // eslint-disable-next-line no-empty-pattern
  launched: async ({}, use) => {
    const port = 9300 + Math.floor(Math.random() * 500);
    const profile = mkdtempSync(join(tmpdir(), 'ngtrace-e2e-'));
    const chrome: ChildProcess = spawn(chromePath, [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--enable-unsafe-extension-debugging',
      '--headless',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ]);
    try {
      await waitForDebugger(port);
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      const session = await browser.newBrowserCDPSession();
      const { id } = (await session.send('Extensions.loadUnpacked' as never, { path: extensionPath } as never)) as { id: string };
      await use({ context: browser.contexts()[0], extensionId: id });
      await browser.close();
    } finally {
      chrome.kill();
      await new Promise((r) => setTimeout(r, 300));
      rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    }
  },
  context: async ({ launched }, use) => use(launched.context),
  extensionId: async ({ launched }, use) => use(launched.extensionId),
  openInspector: async ({ context, extensionId }, use) => {
    await use(async (path = '/', origin = DEMO) => {
      const app = await context.newPage();
      await app.goto(origin + path);
      // An extension page can query chrome.tabs for the demo tab's id.
      const helper = await context.newPage();
      await helper.goto(`chrome-extension://${extensionId}/options.html`);
      const tabId = await helper.evaluate(async (url) => {
        const [tab] = await chrome.tabs.query({ url: url + '/*' });
        return tab.id!;
      }, origin);
      await helper.close();
      const panel = await context.newPage();
      await panel.goto(`chrome-extension://${extensionId}/panel/index.html?tabId=${tabId}`);
      return { app, panel };
    });
  },
});

export const expect = test.expect;
