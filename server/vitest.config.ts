import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests share one Postgres database, so they must not run concurrently.
    fileParallelism: false,
    setupFiles: ['src/test/setup.ts'],
  },
});
