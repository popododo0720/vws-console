import {
  metrics,
  type Counter as OtelCounter,
  type Histogram as OtelHistogram,
  type MeterProvider,
} from "@opentelemetry/api";
import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import type { AuthLogFields } from "@/lib/vws-api/log";
import { TELEMETRY_SCOPE, type RetryReason } from "./span";

/** Every metric the console exports starts with this, so dashboards can tell it from other VWS services. */
export const METRIC_PREFIX = "vws_console_";

/** Served only by the METRICS_PORT listener (metrics-server.ts); the app port answers 404 here. */
export const METRICS_PATH = "/metrics";

type MetricDef =
  | { kind: "counter"; labels: readonly string[]; help: string }
  | { kind: "histogram"; labels: readonly string[]; buckets: readonly number[]; help: string };

/**
 * Every console metric. Each row becomes a prom-client instrument (served on METRICS_PORT) and an OTel
 * instrument of the same name (exported over OTLP when an endpoint is set); the record functions below
 * write both. Labels are closed vocabularies or route templates, never a path, an ID or a user.
 */
export const METRIC_DEFS = {
  http_requests_total: {
    kind: "counter",
    labels: ["method"],
    help: "Requests the console proxy saw (pages, server actions), by HTTP method.",
  },
  api_requests_total: {
    kind: "counter",
    labels: ["method", "route", "status_class", "outcome"],
    help: "Calls from the console server to console-api, retries included in one call, by method, route template, status class and outcome.",
  },
  api_request_duration_seconds: {
    kind: "histogram",
    labels: ["method", "route"],
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    help: "Duration of calls from the console server to console-api, retries and backoff included.",
  },
  api_retries_total: {
    kind: "counter",
    labels: ["route", "reason"],
    help: "GET attempts to console-api sent again, by route template and why the previous attempt failed.",
  },
  api_timeouts_total: {
    kind: "counter",
    labels: ["method", "route"],
    help: "console-api attempts that hit the per-attempt deadline, by method and route template.",
  },
  auth_events_total: {
    kind: "counter",
    labels: ["event", "outcome"],
    help: "Sign-in, sign-out, session and expired-cookie events, by outcome.",
  },
  operation_poll_duration_seconds: {
    kind: "histogram",
    labels: [],
    buckets: [0.5, 1, 2, 5, 10, 20, 30, 60],
    help: "Time from a 202 to the operation leaving the running state, an error, or the 60 s poll deadline.",
  },
} as const satisfies Record<string, MetricDef>;

type Defs = typeof METRIC_DEFS;
type MetricName = keyof Defs;
type CounterName = { [N in MetricName]: Defs[N]["kind"] extends "counter" ? N : never }[MetricName];
type HistogramName = Exclude<MetricName, CounterName>;
type LabelsOf<N extends MetricName> = Record<Defs[N]["labels"][number], string>;

const names = Object.keys(METRIC_DEFS) as MetricName[];

type ConsoleMetrics = { registry: Registry; prom: Record<MetricName, Counter | Histogram> };

declare global {
  // One registry per process: dev HMR re-evaluates this module, and a second registration of the same
  // metric name would throw. The proxy and the route handlers share it through globalThis too.
  var __vwsConsoleMetrics: ConsoleMetrics | undefined;
}

function createMetrics(): ConsoleMetrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: METRIC_PREFIX });
  const prom = Object.fromEntries(
    names.map((name) => {
      const def: MetricDef = METRIC_DEFS[name];
      const common = { name: `${METRIC_PREFIX}${name}`, help: def.help, labelNames: def.labels, registers: [registry] };
      return [
        name,
        def.kind === "counter" ? new Counter(common) : new Histogram({ ...common, buckets: [...def.buckets] }),
      ];
    }),
  ) as ConsoleMetrics["prom"];
  return { registry, prom };
}

export function consoleMetrics(): ConsoleMetrics {
  globalThis.__vwsConsoleMetrics ??= createMetrics();
  return globalThis.__vwsConsoleMetrics;
}

type OtelInstruments = Record<MetricName, OtelCounter | OtelHistogram>;
let otel: { provider: MeterProvider; instruments: OtelInstruments } | null = null;

/** The OTel instruments of the current global meter provider; rebuilt when telemetry installs or removes one. */
function otelInstruments(): OtelInstruments {
  const provider = metrics.getMeterProvider();
  if (otel?.provider !== provider) {
    const meter = provider.getMeter(TELEMETRY_SCOPE);
    const instruments = Object.fromEntries(
      names.map((name) => {
        const def: MetricDef = METRIC_DEFS[name];
        const full = `${METRIC_PREFIX}${name}`;
        return [
          name,
          def.kind === "counter"
            ? meter.createCounter(full, { description: def.help })
            : meter.createHistogram(full, {
                description: def.help,
                unit: "s",
                advice: { explicitBucketBoundaries: [...def.buckets] },
              }),
        ];
      }),
    ) as OtelInstruments;
    otel = { provider, instruments };
  }
  return otel.instruments;
}

function count<N extends CounterName>(name: N, labels: LabelsOf<N>): void {
  (consoleMetrics().prom[name] as Counter).inc(labels);
  (otelInstruments()[name] as OtelCounter).add(1, labels);
}

function observe<N extends HistogramName>(name: N, labels: LabelsOf<N>, seconds: number): void {
  (consoleMetrics().prom[name] as Histogram).observe(labels, seconds);
  (otelInstruments()[name] as OtelHistogram).record(seconds, labels);
}

const KNOWN_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

export type StatusClass = "1xx" | "2xx" | "3xx" | "4xx" | "5xx" | "none";
export type ApiOutcome = "success" | "failure" | "timeout" | "network";

export function methodLabel(method: string): string {
  const upper = method.toUpperCase();
  return KNOWN_METHODS.has(upper) ? upper : "OTHER";
}

export function statusClass(status: number | null): StatusClass {
  if (status === null) return "none";
  if (status < 200) return "1xx";
  if (status < 300) return "2xx";
  if (status < 400) return "3xx";
  if (status < 500) return "4xx";
  return "5xx";
}

export function recordHttpRequest(method: string): void {
  count("http_requests_total", { method: methodLabel(method) });
}

/** One console-api call after its last attempt. status is null when no answer came; kind says why. */
export type ApiCallSample = { method: string; route: string; seconds: number } & (
  { status: number; kind: null } | { status: null; kind: "timeout" | "network" }
);

export function recordApiCall(sample: ApiCallSample): void {
  const method = methodLabel(sample.method);
  const outcome: ApiOutcome = sample.kind ?? (sample.status < 400 ? "success" : "failure");
  count("api_requests_total", { method, route: sample.route, status_class: statusClass(sample.status), outcome });
  observe("api_request_duration_seconds", { method, route: sample.route }, sample.seconds);
}

/** A GET about to be sent again. */
export function recordApiRetry(route: string, reason: RetryReason): void {
  count("api_retries_total", { route, reason });
}

/** One attempt that hit its deadline, whether or not a later attempt answered. */
export function recordApiTimeout(method: string, route: string): void {
  count("api_timeouts_total", { method: methodLabel(method), route });
}

export type AuthMetricEvent = "login" | "logout" | "session" | "expired_cookie_cleared";

export function recordAuthEvent(event: AuthMetricEvent, outcome: AuthLogFields["outcome"]): void {
  count("auth_events_total", { event, outcome });
}

export function recordOperationPoll(seconds: number): void {
  observe("operation_poll_duration_seconds", {}, seconds);
}
