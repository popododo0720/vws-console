import { defineConfig, devices } from "@playwright/test";

// IAM off (detected from console-api -iam static, its default): no sign-in, the console server calls console-api with VWS_CONSOLE_API_TOKEN.
// Runs the resource flows from live-api.spec.ts plus iam-off.spec.ts against console-api's fake backend.
const port = Number(process.env.E2E_PORT ?? 43126);
const ec2Port = Number(process.env.E2E_EC2_PORT ?? 48091);
const apiRepo = process.env.VWS_CONSOLE_API_DIR ?? "../vws-console-api";
process.env.E2E_API_URL = `http://127.0.0.1:${ec2Port - 1}`;

export default defineConfig({
  testDir: "./e2e-live",
  testMatch: [/live-api\.spec\.ts/, /iam-off\.spec\.ts/],
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `go run ./cmd/vws-console-api -backend=fake -iam=static -console-addr=127.0.0.1:${ec2Port - 1} -ec2-addr=127.0.0.1:${ec2Port} -s3-addr=127.0.0.1:${ec2Port + 1} -ops-addr=127.0.0.1:${ec2Port + 2} -account=123456789012 -console-token=dev-token -access-key=AKIDEXAMPLE -secret=secret`,
      cwd: apiRepo,
      url: `http://127.0.0.1:${ec2Port + 2}/readyz`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `npm run start -- -p ${port} -H 127.0.0.1`,
      url: `http://127.0.0.1:${port}/compute/instances`,
      env: { VWS_CONSOLE_API_URL: `http://127.0.0.1:${ec2Port - 1}`, VWS_CONSOLE_API_TOKEN: "dev-token" },
      reuseExistingServer: false,
    },
  ],
});
