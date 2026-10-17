import { defineConfig } from '@playwright/test';
import path from 'node:path';

const runDirectory = process.env.SOFASTREAM_RUN_DIR || 'artifacts/e2e';
if (!process.env.SOFASTREAM_FRONTEND_URL || !process.env.SOFASTREAM_API_URL)
  throw new Error('Run browser tests with npm run test:e2e or npm run check:full.');

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.mjs',
  timeout: 30000,
  expect: { timeout: 10000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  outputDir: path.join(runDirectory, 'browser-results'),
  reporter: [
    ['list'],
    ['html', { outputFolder: 'artifacts/playwright-report', open: 'never' }],
    ['json', { outputFile: path.join(runDirectory, 'browser-results.json') }],
  ],
  use: {
    baseURL: process.env.SOFASTREAM_FRONTEND_URL,
    browserName: 'chromium',
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  },
});
