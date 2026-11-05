import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// The OTel e2e: the production build exports to a real OpenTelemetry Collector (scripts/otelcol.sh, OTLP over
// HTTP in, the file exporter out) while it talks to a deterministic fake console-api. The spec reads the file.
const port = Number(process.env.E2E_PORT ?? 43126);
const apiPort = Number(process.env.E2E_FAKE_API_PORT ?? 43320);
const otlpPort = Number(process.env.E2E_OTLP_PORT ?? 43318);
const healthPort = otlpPort + 1;

process.env.OTEL_E2E_OUT ??= join(mkdtempSync(join(tmpdir(), "vws-otel-e2e-")), "telemetry.jsonl");
process.env.E2E_PASSWORD ??= "pw-e2e-SENTINEL-5c1d";
process.env.E2E_SESSION ??= "sess-e2e-SENTINEL-a93b";
process.env.E2E_CSRF ??= "csrf-e2e-SENTINEL-77e0";

export default defineConfig({
  testDir: "./e2e-otel",
  workers: 1,
  // One test walks four flows, three 500 ms timeouts and the export intervals.
  timeout: 120_000,
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "bash scripts/otelcol.sh --config e2e-otel/collector.yaml",
      url: `http://127.0.0.1:${healthPort}/`,
      env: {
        OTEL_E2E_OUT: process.env.OTEL_E2E_OUT,
        OTEL_E2E_OTLP_PORT: String(otlpPort),
        OTEL_E2E_HEALTH_PORT: String(healthPort),
      },
      reuseExistingServer: false,
      // The first run downloads the pinned Collector.
      timeout: 300_000,
    },
    {
      command: "node e2e-otel/fake-console-api.mts",
      url: `http://127.0.0.1:${apiPort}/healthz`,
      env: {
        FAKE_API_PORT: String(apiPort),
        FAKE_API_SESSION: process.env.E2E_SESSION,
        FAKE_API_CSRF: process.env.E2E_CSRF,
      },
      reuseExistingServer: false,
    },
    {
      command: `npm run start -- -p ${port} -H 127.0.0.1`,
      url: `http://127.0.0.1:${port}/healthz`,
      env: {
        VWS_CONSOLE_API_URL: `http://127.0.0.1:${apiPort}`,
        VWS_CONSOLE_API_TIMEOUT_MS: "500",
        OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${otlpPort}`,
        OTEL_BSP_SCHEDULE_DELAY: "200",
        OTEL_METRIC_EXPORT_INTERVAL: "1000",
      },
      stdout: "pipe",
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
