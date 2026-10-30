import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

/** Every metric the console exports starts with this, so dashboards can tell it from other VWS services. */
export const METRIC_PREFIX = "vws_console_";

/** Labels stay low-cardinality: a fixed method set and a status class, never a path, ID or user. */
const KNOWN_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

export type UpstreamOutcome = "1xx" | "2xx" | "3xx" | "4xx" | "5xx" | "timeout" | "network";

type ConsoleMetrics = {
  registry: Registry;
  httpRequests: Counter<"method">;
  apiRequests: Counter<"method" | "outcome">;
  apiDuration: Histogram<"method" | "outcome">;
};

declare global {
  // One registry per process: dev HMR re-evaluates this module, and a second registration of the same
  // metric name would throw. The proxy and the route handlers share it through globalThis too.
  var __vwsConsoleMetrics: ConsoleMetrics | undefined;
}

function createMetrics(): ConsoleMetrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: METRIC_PREFIX });
  return {
    registry,
    httpRequests: new Counter({
      name: `${METRIC_PREFIX}http_requests_total`,
      help: "Requests the console proxy saw (pages, server actions), by HTTP method.",
      labelNames: ["method"],
      registers: [registry],
    }),
    apiRequests: new Counter({
      name: `${METRIC_PREFIX}api_requests_total`,
      help: "Calls from the console server to console-api, by method and outcome (status class, timeout or network).",
      labelNames: ["method", "outcome"],
      registers: [registry],
    }),
    apiDuration: new Histogram({
      name: `${METRIC_PREFIX}api_request_duration_seconds`,
      help: "Duration of calls from the console server to console-api, retries included.",
      labelNames: ["method", "outcome"],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
      registers: [registry],
    }),
  };
}

export function consoleMetrics(): ConsoleMetrics {
  globalThis.__vwsConsoleMetrics ??= createMetrics();
  return globalThis.__vwsConsoleMetrics;
}

export function methodLabel(method: string): string {
  const upper = method.toUpperCase();
  return KNOWN_METHODS.has(upper) ? upper : "OTHER";
}

export function statusOutcome(status: number): UpstreamOutcome {
  if (status < 200) return "1xx";
  if (status < 300) return "2xx";
  if (status < 400) return "3xx";
  if (status < 500) return "4xx";
  return "5xx";
}

export function recordHttpRequest(method: string): void {
  consoleMetrics().httpRequests.inc({ method: methodLabel(method) });
}

export function recordApiCall({
  method,
  outcome,
  seconds,
}: {
  method: string;
  outcome: UpstreamOutcome;
  seconds: number;
}): void {
  const labels = { method: methodLabel(method), outcome };
  const metrics = consoleMetrics();
  metrics.apiRequests.inc(labels);
  metrics.apiDuration.observe(labels, seconds);
}
