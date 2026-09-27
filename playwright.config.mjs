import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  reporter: process.env.CI ? 'list' : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/AntonsTerminal/`,
    trace: 'off',
  },
  webServer: {
    command: `node test/serve.mjs site ${PORT}`,
    url: `http://127.0.0.1:${PORT}/AntonsTerminal/`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'mobil', use: { ...devices['Pixel 5'] } },
    { name: 'dator', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
});
