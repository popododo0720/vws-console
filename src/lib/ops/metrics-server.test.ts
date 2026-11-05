// @vitest-environment node
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { consoleMetrics, recordHttpRequest } from "./metrics";
import { createMetricsServer, parseMetricsPort, startMetricsServer } from "./metrics-server";

const open: Server[] = [];

async function listening(server: Server, port = 0): Promise<string> {
  open.push(server);
  if (!server.listening) {
    server.listen(port, "127.0.0.1");
    await once(server, "listening");
  }
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function freePort(): Promise<number> {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

function logLines(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown>[] {
  return spy.mock.calls.map((call: unknown[]) => JSON.parse(String(call[0])));
}

afterEach(async () => {
  globalThis.__vwsConsoleMetricsServer = undefined;
  vi.restoreAllMocks();
  await Promise.all(open.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe("parseMetricsPort", () => {
  it("is off when unset, empty or 0", () => {
    for (const raw of [undefined, "", "  ", "0"]) expect(parseMetricsPort(raw)).toEqual({ kind: "off" });
  });

  it("accepts a whole port number from 1 to 65535", () => {
    expect(parseMetricsPort("9464")).toEqual({ kind: "on", port: 9464 });
    expect(parseMetricsPort(" 1 ")).toEqual({ kind: "on", port: 1 });
    expect(parseMetricsPort("65535")).toEqual({ kind: "on", port: 65535 });
  });

  it("rejects anything else", () => {
    for (const raw of ["65536", "-1", "9464.5", "0x10", "09464", "1e3", "9464abc", "abc", "999999"]) {
      expect(parseMetricsPort(raw)).toEqual({ kind: "invalid" });
    }
  });
});

describe("metrics listener", () => {
  it("serves vws_console_ Prometheus text on GET /metrics, uncached", async () => {
    recordHttpRequest("GET");
    const base = await listening(createMetricsServer());
    const response = await fetch(`${base}/metrics?x=1`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/plain; version=0\.0\.4/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toMatch(/^vws_console_http_requests_total\{method="GET"\} [1-9]/m);
  });

  it("answers HEAD without a body", async () => {
    const base = await listening(createMetricsServer());
    const response = await fetch(`${base}/metrics`, { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("answers 404 for every other path, so console pages and probes are not on this port", async () => {
    const base = await listening(createMetricsServer());
    for (const path of ["/", "/healthz", "/readyz", "/metrics/x", "/compute/instances"]) {
      const response = await fetch(`${base}${path}`);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain("vws_console_");
    }
  });

  it("answers 405 for writes to /metrics", async () => {
    const base = await listening(createMetricsServer());
    const response = await fetch(`${base}/metrics`, { method: "POST", body: "x" });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
  });

  it("answers 500 and logs when collection fails", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(consoleMetrics().registry, "metrics").mockRejectedValueOnce(new Error("collector broke"));
    const base = await listening(createMetricsServer());
    const response = await fetch(`${base}/metrics`);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("collector broke");
    expect(logLines(log)).toEqual([expect.objectContaining({ event: "metrics.listen", code: "MetricsCollectFailed" })]);
  });
});

describe("startMetricsServer", () => {
  it("starts nothing when METRICS_PORT is off", () => {
    expect(startMetricsServer(undefined)).toBeNull();
    expect(startMetricsServer("0")).toBeNull();
  });

  it("logs and starts nothing for an invalid METRICS_PORT, without echoing the value", () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(startMetricsServer("not-a-port")).toBeNull();
    const lines = logLines(log);
    expect(lines).toEqual([expect.objectContaining({ event: "metrics.listen", code: "InvalidMetricsPort" })]);
    expect(JSON.stringify(lines)).not.toContain("not-a-port");
  });

  it("listens on the port once per process, even when register() runs again", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const port = await freePort();
    const first = startMetricsServer(String(port));
    expect(first).not.toBeNull();
    expect(startMetricsServer(String(port))).toBe(first);
    const base = await listening(first!);
    expect((await fetch(`${base}/metrics`)).status).toBe(200);
  });

  it("logs a busy port and lets a later start try again", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const busy = createServer();
    await listening(busy);
    const port = (busy.address() as AddressInfo).port;
    const server = startMetricsServer(String(port));
    await once(server!, "error");
    expect(logLines(log)).toEqual([expect.objectContaining({ event: "metrics.listen", code: "EADDRINUSE" })]);
    expect(globalThis.__vwsConsoleMetricsServer).toBeUndefined();
  });
});
