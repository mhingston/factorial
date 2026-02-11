import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 85,
        branches: 70,
      },
      exclude: [
        'node_modules/',
        'dist/',
        'tests/fixtures/**',
        '**/*.d.ts',
        '**/*.config.ts',
        'index.ts',
        'packages/cli/src/index.ts',
        'packages/dot-parser/src/parser.js',
        'packages/dot-parser/src/ast.ts',
        'packages/dot-parser/src/types.ts',
        'packages/core/src/handlers/builtin.ts',
        'scripts/**',
      ],
    },
  },
});
