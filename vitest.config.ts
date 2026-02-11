import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 20,
        statements: 20,
        functions: 20,
        branches: 15,
      },
      exclude: [
        'node_modules/',
        'dist/',
        'tests/fixtures/**',
        '**/*.d.ts',
        '**/*.config.ts',
      ],
    },
  },
});
