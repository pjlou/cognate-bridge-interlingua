import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // Keeps the dev client on a same-origin '/api' path, so the axios base URL is
    // identical in development and in a production build served behind a proxy.
    proxy: {
      '/api': { target: 'http://localhost:3002', changeOrigin: true },
      '/health': { target: 'http://localhost:3002', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
