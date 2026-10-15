import { defineConfig, devices } from '@playwright/test';

// Browser check of the stand-alone consumer app built by `pnpm verify:consumer` (T-024).
const app = process.env.CONSUMER_APP;
if (!app) throw new Error('Set CONSUMER_APP to the app directory printed by `pnpm verify:consumer`.');

export default defineConfig({
  testDir: 'e2e-consumer',
  use: { baseURL: 'http://127.0.0.1:4180' },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4180',
    cwd: app,
    url: 'http://127.0.0.1:4180',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
