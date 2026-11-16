import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Pixel 7"],
    locale: "zh-CN",
    // PW_CHROME_PATH=/path/to/chrome to skip `playwright install`
    launchOptions: process.env.PW_CHROME_PATH ? { executablePath: process.env.PW_CHROME_PATH } : {},
  },
  // offline: bundled fixtures, no public APIs
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    env: { CITYWALK_OFFLINE: "1" },
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
