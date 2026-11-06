import { context, metrics, propagation, trace, type TextMapPropagator } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { defaultResource, detectResources, envDetector, resourceFromAttributes } from "@opentelemetry/resources";
import { MeterProvider, PeriodicExportingMetricReader, type PushMetricExporter } from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor, TracerProvider, type SpanExporter, type SpanProcessor } from "@opentelemetry/sdk-trace";
import { TELEMETRY_SCOPE } from "./span";

/**
 * The only module that imports the OpenTelemetry SDK and exporters. instrumentation.ts loads it on the Node
 * runtime only, so none of it reaches the browser bundle (scripts/check-client-bundle.sh checks the build).
 */
export type TelemetryConfig =
  | { kind: "disabled" }
  | {
      kind: "enabled";
      /** An OTLP endpoint is set for the signal. Without one, nothing is buffered and no socket is opened. */
      traces: boolean;
      metrics: boolean;
      spanDelayMs: number;
      metricIntervalMs: number;
    };

/** Exporters a test passes in place of OTLP. */
export type TelemetrySinks = { spans: SpanExporter; metrics: PushMetricExporter };

export type TelemetryHandle = {
  config: TelemetryConfig;
  /** Pushes buffered spans and metrics now. Never rejects. */
  flush(): Promise<void>;
  /** Flushes, then uninstalls the global providers so a later startTelemetry installs fresh ones. */
  shutdown(): Promise<void>;
};

const DEFAULT_SERVICE_NAME = "vws-console";
const SIGTERM_FLUSH_MS = 2_000;

function positive(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * OTEL_SDK_DISABLED=true installs nothing. Otherwise a signal exports when OTEL_EXPORTER_OTLP_ENDPOINT or its
 * signal-specific endpoint is set; the exporters read those, the headers and the timeouts themselves.
 */
export function telemetryConfigFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): TelemetryConfig {
  if (env.OTEL_SDK_DISABLED?.trim().toLowerCase() === "true") return { kind: "disabled" };
  const set = (name: string) => Boolean(env[name]?.trim());
  return {
    kind: "enabled",
    traces: set("OTEL_EXPORTER_OTLP_ENDPOINT") || set("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"),
    metrics: set("OTEL_EXPORTER_OTLP_ENDPOINT") || set("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT"),
    spanDelayMs: positive(env.OTEL_BSP_SCHEDULE_DELAY, 5_000),
    metricIntervalMs: positive(env.OTEL_METRIC_EXPORT_INTERVAL, 60_000),
  };
}

/**
 * Injects W3C traceparent toward console-api but never extracts one. Next extracts the global propagator's
 * context from every browser request, and a browser-sent traceparent would otherwise pick the console's trace
 * id and, with flags 00, switch off sampling for every console span of that request.
 */
function injectOnly(inner: TextMapPropagator): TextMapPropagator {
  return {
    inject: (ctx, carrier, setter) => inner.inject(ctx, carrier, setter),
    extract: (ctx) => ctx,
    fields: () => inner.fields(),
  };
}

/** Forwards only the console's own spans, before they are buffered. */
function consoleSpansOnly(next: SpanProcessor): SpanProcessor {
  const ours = (span: { instrumentationScope: { name: string } }) => span.instrumentationScope.name === TELEMETRY_SCOPE;
  return {
    onStart: (span, parent) => {
      if (ours(span)) next.onStart(span, parent);
    },
    onEnd: (span) => {
      if (ours(span)) next.onEnd(span);
    },
    forceFlush: () => next.forceFlush(),
    shutdown: () => next.shutdown(),
  };
}

const settle = (pending: Promise<unknown>) =>
  pending.then(
    () => undefined,
    () => undefined,
  );

function release(handle: TelemetryHandle): void {
  if (globalThis.__vwsConsoleTelemetry === handle) globalThis.__vwsConsoleTelemetry = undefined;
}

function install(config: TelemetryConfig, sinks: TelemetrySinks | undefined): TelemetryHandle {
  if (config.kind === "disabled") {
    const off: TelemetryHandle = { config, flush: async () => {}, shutdown: async () => release(off) };
    return off;
  }
  // OTEL_SERVICE_NAME and OTEL_RESOURCE_ATTRIBUTES (the env detector) win over the default name.
  const resource = defaultResource()
    .merge(resourceFromAttributes({ "service.name": DEFAULT_SERVICE_NAME }))
    .merge(detectResources({ detectors: [envDetector] }));
  const spanExporter = sinks?.spans ?? (config.traces ? new OTLPTraceExporter() : null);
  const tracerProvider = new TracerProvider({
    resource,
    spanProcessors: spanExporter
      ? [consoleSpansOnly(new BatchSpanProcessor({ exporter: spanExporter, scheduledDelayMillis: config.spanDelayMs }))]
      : [],
  });
  const metricExporter = sinks?.metrics ?? (config.metrics ? new OTLPMetricExporter() : null);
  const meterProvider = metricExporter
    ? new MeterProvider({
        resource,
        readers: [
          new PeriodicExportingMetricReader({
            exporter: metricExporter,
            exportIntervalMillis: config.metricIntervalMs,
            exportTimeoutMillis: Math.min(30_000, config.metricIntervalMs),
          }),
        ],
      })
    : null;
  // Spans get ids even with no exporter, so traceparent reaches console-api and auth logs carry trace_id.
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(injectOnly(new W3CTraceContextPropagator()));
  trace.setGlobalTracerProvider(tracerProvider);
  if (meterProvider) metrics.setGlobalMeterProvider(meterProvider);

  const flush = () => settle(Promise.all([tracerProvider.forceFlush(), meterProvider?.forceFlush()]));
  // Next exits on SIGTERM after closing its server; this flush races that window and is bounded. When no
  // one else listens, the signal is raised again afterwards so the process still exits.
  const onSigterm = () => {
    const alone = process.listenerCount("SIGTERM") === 0;
    const bound = new Promise((resolve) => setTimeout(resolve, SIGTERM_FLUSH_MS).unref());
    void Promise.race([flush(), bound]).then(() => {
      if (alone) process.kill(process.pid, "SIGTERM");
    });
  };
  if (spanExporter || metricExporter) process.once("SIGTERM", onSigterm);

  const handle: TelemetryHandle = {
    config,
    flush,
    shutdown: async () => {
      process.off("SIGTERM", onSigterm);
      await flush();
      await settle(Promise.all([tracerProvider.shutdown(), meterProvider?.shutdown()]));
      trace.disable();
      metrics.disable();
      propagation.disable();
      context.disable();
      release(handle);
    },
  };
  return handle;
}

declare global {
  // register() can run more than once per process (dev HMR); a second install would double every span.
  var __vwsConsoleTelemetry: TelemetryHandle | undefined;
}

/** Installs the global providers once per process and returns the live handle on every later call. */
export function startTelemetry(
  config: TelemetryConfig = telemetryConfigFromEnv(),
  sinks?: TelemetrySinks,
): TelemetryHandle {
  globalThis.__vwsConsoleTelemetry ??= install(config, sinks);
  return globalThis.__vwsConsoleTelemetry;
}
