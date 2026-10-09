import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    projects: [
      {
        // The page, in jsdom
        extends: true,
        test: {
          name: 'page',
          environment: 'jsdom',
          setupFiles: './src/test/setup.ts',
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        // The command line and its server, in Node
        extends: true,
        test: {
          name: 'cli',
          environment: 'node',
          include: ['test/**/*.test.mjs'],
        },
      },
    ],
  },
});
