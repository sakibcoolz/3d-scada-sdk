import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts'],
    benchmark: { include: ['packages/**/*.bench.ts'] },
  },
});
