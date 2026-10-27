// Captures raw panel screenshots of each feature, driving the real extension against the demo app.
// Needs: npm run build, npm run build:demo, and `npm run demo` running on :4321.
// Usage: node marketing/capture.mjs [scene...]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DEMO = 'http://localhost:4321';
const OUT = resolve('marketing/raw');
const W = 1440;
const H = 810;
const chromePath = process.env['E2E_CHROME'] ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = (panel) => panel.getByTestId('request-row');
const named = (panel, name) =>
  rows(panel).filter({ has: panel.locator('td.name .url', { hasText: new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }) });

const scenes = {
  async components({ app, panel }) {
    await app.click('#add-to-cart');
    await app.fill('#search', 'ha');
    await named(panel, 'search?q=ha').first().waitFor();
    await panel.getByTestId('node-ProductListComponent').click();
    await named(panel, 'products?page=1').first().click();
    await panel.getByTestId('tab-initiator').click();
    return '.tree-pane';
  },
  async headers({ app, panel }) {
    await app.click('#add-to-cart');
    await named(panel, 'cart').first().click();
    await panel.getByTestId('tab-headers').click();
    return '.detail-pane';
  },
  async timeline({ app, panel }) {
    await sleep(400);
    await app.fill('#search', 'ha');
    await sleep(500);
    await app.click('#add-to-cart');
    await sleep(300);
    await app.click('#go-store-3');
    await sleep(900);
    await panel.getByTestId('view-timeline').click();
    return '.table-pane';
  },
  async waste({ app, panel }) {
    await app.click('#fire-duplicates');
    await app.click('#fire-cancel');
    await sleep(1500);
    await panel.getByTestId('waste-toggle').click();
    return '.table-pane';
  },
  async errors({ app, panel }) {
    await app.click('#fire-flaky');
    await app.click('#fire-error');
    await sleep(1500);
    await panel.getByTestId('failures-toggle').click();
    await rows(panel).filter({ hasText: 'flaky' }).last().click();
    return '.table-pane';
  },
  async interceptors({ app, panel }) {
    await app.click('#load-profile');
    await named(panel, 'profile').first().waitFor();
    await app.click('#load-profile');
    await app.click('#load-unstable');
    await sleep(1200);
    await named(panel, 'profile').first().click();
    await panel.getByTestId('tab-interceptors').click();
    return '.detail-pane';
  },
  async tokens({ app, panel }) {
    await app.click('#login');
    await named(panel, 'login').first().waitFor();
    await app.click('#call-query');
    await named(panel, 'login').first().click();
    await panel.getByTestId('tab-tokens').click();
    return '.detail-pane';
  },
  async contract({ app, panel }) {
    await app.click('#load-drift');
    await named(panel, '3').first().waitFor();
    await named(panel, '1').first().click();
    await panel.getByTestId('tab-contract').click();
    return '.detail-pane';
  },
  async replay({ app, panel }) {
    await app.click('#add-to-cart');
    await named(panel, 'cart').first().click();
    await panel.getByTestId('tab-replay').click();
    await panel.getByTestId('edit-resend-button').click();
    return '.detail-pane';
  },
  async signals({ app, panel }) {
    await panel.getByTestId('node-ResourcesComponent').click();
    await panel.getByTestId('signal-id').waitFor();
    await app.click('#next-product');
    await sleep(800);
    return '.tree-pane';
  },
  async mocks({ panel }) {
    await named(panel, 'products?page=1').first().click();
    await panel.getByTestId('mock-this').click();
    return '.extras';
  },
};

const paths = { waste: '/waste', errors: '/errors', interceptors: '/interceptors', tokens: '/auth', contract: '/contract', signals: '/resources' };

async function waitForDebugger(port) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error('Chrome did not start');
}

const wanted = process.argv.slice(2);
const port = 9800 + Math.floor(Math.random() * 100);
const profile = mkdtempSync(join(tmpdir(), 'ngtrace-shots-'));
const chrome = spawn(chromePath, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--enable-unsafe-extension-debugging',
  '--headless',
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  'about:blank',
]);
mkdirSync(OUT, { recursive: true });
try {
  await waitForDebugger(port);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const session = await browser.newBrowserCDPSession();
  const { id } = await session.send('Extensions.loadUnpacked', { path: resolve('dist/extension') });
  const context = browser.contexts()[0];

  for (const [name, run] of Object.entries(scenes)) {
    if (wanted.length && !wanted.includes(name)) continue;
    const origin = DEMO;
    const app = await context.newPage();
    await app.goto(origin + (paths[name] ?? '/'));
    const helper = await context.newPage();
    await helper.goto(`chrome-extension://${id}/options.html`);
    const tabId = await helper.evaluate(async (url) => (await chrome.tabs.query({ url: url + '/*' }))[0].id, origin);
    await helper.close();
    const panel = await context.newPage();
    const cdp = await context.newCDPSession(panel);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false });
    await panel.goto(`chrome-extension://${id}/panel/index.html?tabId=${tabId}`);
    // Pane widths that keep the detail tabs on one row and the table columns readable.
    await panel.evaluate(() => localStorage.setItem('ngtrace.layout', JSON.stringify({ tree: 240, detail: 700, details: 470 })));
    await panel.reload();
    await panel.evaluate(() => document.documentElement.classList.add('dark'));
    await rows(panel).first().waitFor();
    await sleep(500);
    try {
      const focus = await run({ app, panel });
      await sleep(900);
      await panel.mouse.move(0, H - 1);
      await panel.screenshot({ path: join(OUT, `${name}.png`) });
      const box = focus ? await panel.locator(focus).first().boundingBox() : null;
      writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ width: W, height: H, focus: box }));
      console.log('ok', name);
    } catch (e) {
      console.log('FAIL', name, e.message.split('\n')[0]);
      await panel.screenshot({ path: join(OUT, `${name}.fail.png`) });
    }
    await panel.close();
    await app.close();
  }
  await browser.close();
  // showcase.html loads this over file://, where fetch() is not allowed.
  const boxes = Object.fromEntries(
    readdirSync(OUT).filter((f) => f.endsWith('.json')).map((f) => [f.slice(0, -5), JSON.parse(readFileSync(join(OUT, f), 'utf8'))]),
  );
  writeFileSync(join(OUT, 'boxes.js'), `window.BOXES = ${JSON.stringify(boxes, null, 2)};
`);
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
}
