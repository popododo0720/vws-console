import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 43125);
const ec2Port = Number(process.env.E2E_EC2_PORT ?? 48081);
const apiRepo = process.env.VWS_CONSOLE_API_DIR ?? "../vws-console-api";

export default defineConfig({
  testDir: "./e2e-live",
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `go run ./cmd/vws-console-api -backend=fake -console-addr=127.0.0.1:${ec2Port - 1} -ec2-addr=127.0.0.1:${ec2Port} -s3-addr=127.0.0.1:${ec2Port + 1} -ops-addr=127.0.0.1:${ec2Port + 2} -account=123456789012 -console-token=dev-token -access-key=AKIDEXAMPLE -secret=secret`,
      cwd: apiRepo,
      url: `http://127.0.0.1:${ec2Port + 2}/readyz`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `npm run start -- -p ${port} -H 127.0.0.1`,
      url: `http://127.0.0.1:${port}`,
      env: {
        VWS_CONSOLE_API_URL: `http://127.0.0.1:${ec2Port - 1}`,
        VWS_CONSOLE_API_TOKEN: "dev-token",
      },
      reuseExistingServer: false,
    },
  ],
});
