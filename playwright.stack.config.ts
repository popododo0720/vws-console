import { defineConfig, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const port = Number(process.env.E2E_STACK_PORT ?? 21700);
process.env.TMPDIR ??= resolve(".cache/e2e-stack/tmp");
mkdirSync(process.env.TMPDIR, { recursive: true });

export default defineConfig({
  testDir: "./e2e-stack",
  globalSetup: "./e2e-stack/setup.ts",
  globalTimeout: 600_000,
  workers: 1,
  timeout: 60_000,
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
