import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.mjs',
  timeout: 30000,
  expect: { timeout: 10000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  webServer: [
    {
      command: 'dotnet run --project SofaStream.Api --no-launch-profile --no-restore --urls http://localhost:5063',
      env: {
        ConnectionStrings__DefaultConnection: 'Host=localhost;Port=5434;Database=sofa_dev;Username=sofa_dev;Password=sofa_local_only',
      },
      url: 'http://localhost:5063/health/ready',
      timeout: 120000,
    },
    {
      command: 'python3 -m http.server 8000 --bind 127.0.0.1 --directory Frontend',
      url: 'http://127.0.0.1:8000',
      stderr: 'ignore',
    },
  ],
  use: {
    baseURL: 'http://localhost:8000',
    browserName: 'chromium',
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  },
});
