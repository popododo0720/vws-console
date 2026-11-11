import { defineConfig, devices } from "@playwright/test";

// The admin e2e: the production build talks to a deterministic fake console-api (e2e-admin/fake-console-api.mts)
// that knows an administrator and a user without admin permissions.
const port = Number(process.env.E2E_PORT ?? 43127);
const apiPort = Number(process.env.E2E_FAKE_API_PORT ?? 43321);

export default defineConfig({
  testDir: "./e2e-admin",
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e-admin/fake-console-api.mts",
      url: `http://127.0.0.1:${apiPort}/healthz`,
      env: { FAKE_API_PORT: String(apiPort) },
      reuseExistingServer: false,
    },
    {
      command: `npm run start -- -p ${port} -H 127.0.0.1`,
      url: `http://127.0.0.1:${port}/healthz`,
      env: { VWS_CONSOLE_API_URL: `http://127.0.0.1:${apiPort}` },
      reuseExistingServer: false,
    },
  ],
});
