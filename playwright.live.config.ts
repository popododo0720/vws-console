import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 43125);
const ec2Port = Number(process.env.E2E_EC2_PORT ?? 48081);
const apiRepo = process.env.VWS_CONSOLE_API_DIR ?? "../vws-console-api";

// The root console password for this run only. Specs read it from E2E_ROOT_PASSWORD; it is never given to the console.
process.env.E2E_ROOT_PASSWORD ??= "e2e-root-password";
process.env.E2E_API_URL = `http://127.0.0.1:${ec2Port - 1}`;
const passwordFile = join(mkdtempSync(join(tmpdir(), "vws-e2e-")), "root-password");
writeFileSync(passwordFile, process.env.E2E_ROOT_PASSWORD, { mode: 0o600 });

export default defineConfig({
  testDir: "./e2e-live",
  // IAM on: sign-in flow. iam-off.spec.ts runs from playwright.live-iam-off.config.ts.
  testIgnore: /iam-off\.spec\.ts/,
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [
    { name: "setup", testMatch: /login\.setup\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "chromium", dependencies: ["setup"], use: { ...devices["Desktop Chrome"], storageState: "e2e-live/.auth/root.json" } },
  ],
  webServer: [
    {
      // -console-token stays only so specs can seed through the API directly; the console itself signs in with a session.
      command: `go run ./cmd/vws-console-api -backend=fake -iam=fake -iam-addr=127.0.0.1:${ec2Port + 3} -root-password-file=${passwordFile} -console-origins=http://127.0.0.1:${port} -console-addr=127.0.0.1:${ec2Port - 1} -ec2-addr=127.0.0.1:${ec2Port} -s3-addr=127.0.0.1:${ec2Port + 1} -ops-addr=127.0.0.1:${ec2Port + 2} -account=123456789012 -console-token=dev-token -access-key=AKIDEXAMPLE -secret=secret`,
      cwd: apiRepo,
      url: `http://127.0.0.1:${ec2Port + 2}/readyz`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `npm run start -- -p ${port} -H 127.0.0.1`,
      url: `http://127.0.0.1:${port}/login`,
      env: { VWS_CONSOLE_API_URL: `http://127.0.0.1:${ec2Port - 1}`, VWS_CONSOLE_IAM: "on" },
      // Keep the console's structured auth log lines in the run output as evidence.
      stdout: "pipe",
      reuseExistingServer: false,
    },
  ],
});
