import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  workers: 1,
  reporter: 'list',
  webServer: [
    { command: 'node e2e/server.mjs', url: 'http://localhost:4321/api/config', reuseExistingServer: true },
    {
      command: 'node e2e/server.mjs',
      url: 'http://localhost:4322/api/config',
      reuseExistingServer: true,
      env: { PORT: '4322', DEMO_ROOT: 'dist/demo-app-zoneless/browser' },
    },
  ],
});
