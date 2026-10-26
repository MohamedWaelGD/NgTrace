import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@ngapi/protocol': fileURLToPath(new URL('./packages/protocol/src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['packages/**/*.test.ts', 'extension/src/**/*.test.ts'],
    environment: 'node',
  },
});
