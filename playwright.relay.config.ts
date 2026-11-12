import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const port = Number(process.env.E2E_RELAY_PORT ?? 43128);
const apiPort = Number(process.env.E2E_RELAY_API_PORT ?? 43322);
const standalone = process.env.E2E_RELAY_STANDALONE_DIR;

export default defineConfig({
  testDir: "./e2e-relay",
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e-relay/fake-console-api.mts",
      url: `http://127.0.0.1:${apiPort}/healthz`,
      env: { FAKE_API_PORT: String(apiPort) },
      reuseExistingServer: false,
    },
    {
      command: standalone ? "node server/console-server.mts" : `npm run start -- -p ${port} -H 127.0.0.1`,
      cwd: standalone ? resolve(standalone) : undefined,
      url: `http://127.0.0.1:${port}/healthz`,
      env: {
        VWS_CONSOLE_API_URL: `http://127.0.0.1:${apiPort}`,
        VWS_CONSOLE_API_TIMEOUT_MS: "1000",
        VWS_CONSOLE_RELAY_IDLE_TIMEOUT_MS: "2000",
        PORT: String(port),
        HOSTNAME: "127.0.0.1",
      },
      reuseExistingServer: false,
    },
  ],
});
