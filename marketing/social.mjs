// Renders social-preview.html into the GitHub social preview (1280×640). Usage: node marketing/social.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT = resolve('marketing/out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env['E2E_CHROME'] ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--hide-scrollbars'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(pathToFileURL(resolve('marketing/social-preview.html')).href);
await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: resolve(OUT, 'social-preview.png') });
await browser.close();
console.log('marketing/out/social-preview.png');
