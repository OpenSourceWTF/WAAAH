import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Force in-memory database for ALL tests
    env: {
      DB_PATH: ':memory:',
      WAAAH_API_KEY: 'test-api-key-12345'
    },
    // Other test settings
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary'],
      reportsDirectory: './coverage',
      enabled: true
    }
  }
});
