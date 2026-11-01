import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8790',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    channel: 'chrome',
  },
  webServer: {
    command: 'npm run seed && npm run start',
    url: 'http://127.0.0.1:8790/api/health',
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      PORT: '8790',
      AUTH_REQUIRED: 'false',
      PICOLAH_DB_PATH: './e2e.db',
    },
  },
});
