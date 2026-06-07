import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.js'],
    pool: 'vmForks',
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
