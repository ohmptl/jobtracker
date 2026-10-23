import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "*.spec.ts",
  fullyParallel: true,
  workers: 2,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: {
    command: "node tests/browser/server.mjs",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
