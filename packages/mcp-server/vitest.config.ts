import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Force in-memory database for ALL tests
    env: {
      DB_PATH: ':memory:'
    },
    // Other test settings
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8'
    }
  }
});
