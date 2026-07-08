import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:4000'
const apiURL = process.env.E2E_API_URL || 'http://localhost:7070'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : [
        {
          command: 'cd ../backend && go run ./cmd/api',
          url: `${apiURL}/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            ...process.env,
            APP_PORT: '7070',
            MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017',
            MONGODB_DATABASE: process.env.MONGODB_DATABASE || 'myrent',
            JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-in-production-min-32-chars',
            CORS_ORIGINS: 'http://localhost:4000',
            FRONTEND_URL: 'http://localhost:4000',
          },
        },
        {
          command: 'npm run dev',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
})
