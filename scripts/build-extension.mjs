// Builds dist/extension, ready for chrome://extensions → "Load unpacked".
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const out = 'dist/extension';
const watch = process.argv.includes('--watch');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: {
    hook: 'extension/src/hook/index.ts',
    content: 'extension/src/content.ts',
    background: 'extension/src/background.ts',
    devtools: 'extension/src/devtools.ts',
    options: 'extension/src/options.ts',
  },
  outdir: out,
  bundle: true,
  format: 'iife',
  target: 'chrome111',
  sourcemap: watch ? 'inline' : false,
  tsconfig: 'tsconfig.scripts.json',
  logLevel: 'warning',
});

cpSync('extension/static', out, { recursive: true });

// --skip-panel reuses the last panel build (faster when only the scripts changed).
if (!process.argv.includes('--skip-panel') || !existsSync('dist/panel/browser')) {
  execSync('npx ng build panel', { stdio: 'inherit' });
}
cpSync('dist/panel/browser', `${out}/panel`, { recursive: true });
console.log(`Built ${out}`);
