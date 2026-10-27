// Renders showcase.html into store screenshots (the trailer is the Remotion project in video/).
// Run marketing/capture.mjs first. Usage: node marketing/render.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT = resolve('marketing/out');
const page = pathToFileURL(resolve('marketing/showcase.html')).href;
const SCENES = ['components', 'timeline', 'errors', 'waste', 'interceptors', 'tokens', 'contract', 'replay', 'mocks', 'signals'];

const browser = await chromium.launch({
  executablePath: process.env['E2E_CHROME'] ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--hide-scrollbars'],
});

async function open(url, width, height, scale) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const p = await ctx.newPage();
  await p.goto(url);
  await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
  await p.evaluate(() => document.fonts.ready);
  return p;
}

{
  const dir = join(OUT, 'screenshots');
  mkdirSync(dir, { recursive: true });
  for (const [i, id] of SCENES.entries()) {
    const n = String(i + 1).padStart(2, '0');
    for (const scale of [1, 2]) {
      const p = await open(`${page}?scene=${id}&h=800`, 1280, 800, scale);
      await p.screenshot({ path: join(dir, `${n}-${id}${scale === 2 ? '@2x' : ''}.png`) });
      await p.context().close();
    }
    console.log('still', id);
  }
}

await browser.close();
