import { AggregationTemporality, InMemoryMetricExporter, type DataPoint } from "@opentelemetry/sdk-metrics";
import { InMemorySpanExporter, type ReadableSpan } from "@opentelemetry/sdk-trace";
import { startTelemetry, type TelemetryConfig } from "./telemetry";

/** Test-only: the real providers with in-memory exporters in place of OTLP. App code never imports this. */
export type MemoryTelemetry = {
  spans(): Promise<ReadableSpan[]>;
  /** Every data point of a metric, from the latest cumulative export. */
  points(name: string): Promise<DataPoint<unknown>[]>;
  /** Every metric name exported so far. */
  metricNames(): Promise<string[]>;
  shutdown(): Promise<void>;
};

export function startMemoryTelemetry(): MemoryTelemetry {
  const spanExporter = new InMemorySpanExporter();
  const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  const config: TelemetryConfig = {
    kind: "enabled",
    traces: false,
    metrics: false,
    spanDelayMs: 60_000,
    metricIntervalMs: 60_000,
  };
  const handle = startTelemetry(config, { spans: spanExporter, metrics: metricExporter });
  if (handle.config !== config) throw new Error("Telemetry is already started; shut the last test's down.");
  const latest = async () => {
    await handle.flush();
    return (
      metricExporter
        .getMetrics()
        .at(-1)
        ?.scopeMetrics.flatMap((scope) => scope.metrics) ?? []
    );
  };
  return {
    spans: async () => {
      await handle.flush();
      return spanExporter.getFinishedSpans();
    },
    points: async (name) => (await latest()).find((metric) => metric.descriptor.name === name)?.dataPoints ?? [],
    metricNames: async () => (await latest()).map((metric) => metric.descriptor.name),
    shutdown: () => handle.shutdown(),
  };
}
