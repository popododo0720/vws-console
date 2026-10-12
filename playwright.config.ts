import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 43124);

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run start -- -p ${port} -H 127.0.0.1`,
    url: `http://127.0.0.1:${port}`,
    env: { VWS_E2E: "1" },
    reuseExistingServer: false,
  },
});
