import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// Performance baseline runs (`pnpm perf`). Not part of `pnpm test:e2e`: numbers are recorded, not asserted.
export default defineConfig({
  ...base,
  testDir: 'perf',
  testMatch: '*.perf.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 800 } } }],
});
