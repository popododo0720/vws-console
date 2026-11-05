import { expect, test } from "@playwright/test";
import { metricsPort } from "../playwright.config";

// Against the production build (`next start`): the probes answer without a session on the app port,
// metrics are served only on METRICS_PORT, nothing is cached, and every metric carries vws_console_.
test("healthz answers 200 JSON", async ({ request }) => {
  const response = await request.get("/healthz");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toEqual({ status: "ok" });
});

test("readyz is ready with local data only", async ({ request }) => {
  const response = await request.get("/readyz");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect((await response.json()).status).toBe("ok");
});

test("the app port answers 404 for /metrics", async ({ request }) => {
  const response = await request.get("/metrics", { maxRedirects: 0 });
  expect(response.status()).toBe(404);
  expect(await response.text()).not.toContain("vws_console_");
});

test("METRICS_PORT serves vws_console_ Prometheus text", async ({ request }) => {
  await request.get("/compute/instances");
  const response = await request.get(`http://127.0.0.1:${metricsPort}/metrics`);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["content-type"]).toMatch(/^text\/plain; version=0\.0\.4/);
  const text = await response.text();
  expect(text).toMatch(/^vws_console_http_requests_total\{method="GET"\} [1-9]/m);
  const names = text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => (line.startsWith("#") ? line.split(" ")[2] : line.split(/[{ ]/)[0]));
  expect(names.filter((name) => !name.startsWith("vws_console_"))).toEqual([]);
});
