import { createServer, type Server } from "node:http";
import { logAuth } from "@/lib/vws-api/log";
import { METRICS_PATH, consoleMetrics } from "./metrics";

export type MetricsPort = { kind: "off" } | { kind: "on"; port: number } | { kind: "invalid" };

/** Unset, empty or 0 turns the listener off; anything else must be a whole port number 1 to 65535. */
export function parseMetricsPort(raw: string | undefined): MetricsPort {
  const value = raw?.trim() ?? "";
  if (value === "" || value === "0") return { kind: "off" };
  if (!/^[1-9][0-9]{0,4}$/.test(value)) return { kind: "invalid" };
  const port = Number(value);
  return port <= 65_535 ? { kind: "on", port } : { kind: "invalid" };
}

function logListener(outcome: "success" | "error", code: string | null): void {
  logAuth({ event: "metrics.listen", outcome, status: null, requestId: null, durationMs: 0, code });
}

/** Serves only GET and HEAD /metrics; the app port has no metrics route. */
export function createMetricsServer(): Server {
  return createServer((request, response) => {
    const path = (request.url ?? "").split("?")[0];
    if (path !== METRICS_PATH) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      response.end("Not Found\n");
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { allow: "GET, HEAD", "cache-control": "no-store" });
      response.end();
      return;
    }
    const { registry } = consoleMetrics();
    registry.metrics().then(
      (text) => {
        response.writeHead(200, { "content-type": registry.contentType, "cache-control": "no-store" });
        response.end(request.method === "HEAD" ? undefined : text);
      },
      () => {
        logListener("error", "MetricsCollectFailed");
        response.writeHead(500, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
        response.end("Internal Server Error\n");
      },
    );
  });
}

declare global {
  // register() can run more than once per process in dev; a second listen on the port would fail.
  var __vwsConsoleMetricsServer: Server | undefined;
}

/** Starts the metrics listener from METRICS_PORT once per process; returns null when it is off or invalid. */
export function startMetricsServer(raw: string | undefined = process.env.METRICS_PORT): Server | null {
  if (globalThis.__vwsConsoleMetricsServer) return globalThis.__vwsConsoleMetricsServer;
  const config = parseMetricsPort(raw);
  if (config.kind === "invalid") {
    logListener("error", "InvalidMetricsPort");
    return null;
  }
  if (config.kind === "off") return null;
  const server = createMetricsServer();
  server.on("error", (error: NodeJS.ErrnoException) => {
    logListener("error", error.code ?? "MetricsListenFailed");
    if (globalThis.__vwsConsoleMetricsServer === server) globalThis.__vwsConsoleMetricsServer = undefined;
  });
  server.on("listening", () => logListener("success", null));
  // The listener must not keep the process alive after the app server shuts down.
  server.unref();
  server.listen(config.port);
  globalThis.__vwsConsoleMetricsServer = server;
  return server;
}
