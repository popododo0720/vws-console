// @vitest-environment node
import { Socket } from "node:net";
import { trace } from "@opentelemetry/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startMemoryTelemetry } from "./memory-telemetry";
import { activeTraceIds, traceHeaders, withSpan } from "./span";
import { startTelemetry, telemetryConfigFromEnv } from "./telemetry";

const TRACEPARENT = /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/;

afterEach(async () => {
  await globalThis.__vwsConsoleTelemetry?.shutdown();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("telemetryConfigFromEnv", () => {
  it("exports a signal only when its endpoint or the common one is set", () => {
    expect(telemetryConfigFromEnv({})).toMatchObject({ kind: "enabled", traces: false, metrics: false });
    expect(telemetryConfigFromEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://c:4318" })).toMatchObject({
      traces: true,
      metrics: true,
    });
    expect(telemetryConfigFromEnv({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://c:4318/v1/traces" })).toMatchObject({
      traces: true,
      metrics: false,
    });
    expect(telemetryConfigFromEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: "  " })).toMatchObject({ traces: false });
    expect(telemetryConfigFromEnv({ OTEL_SDK_DISABLED: "TRUE", OTEL_EXPORTER_OTLP_ENDPOINT: "http://c" })).toEqual({
      kind: "disabled",
    });
  });

  it("reads the export intervals and ignores values that are not positive integers", () => {
    expect(telemetryConfigFromEnv({ OTEL_BSP_SCHEDULE_DELAY: "250", OTEL_METRIC_EXPORT_INTERVAL: "-1" })).toMatchObject(
      {
        spanDelayMs: 250,
        metricIntervalMs: 60_000,
      },
    );
  });
});

describe("startTelemetry", () => {
  it("with no endpoint exports nothing and opens no socket, but still sends traceparent and logs ids", async () => {
    const connect = vi.spyOn(Socket.prototype, "connect");
    const handle = startTelemetry(telemetryConfigFromEnv({}));
    let inside: { headers: Record<string, string>; ids: ReturnType<typeof activeTraceIds> } | null = null;
    await withSpan("console-api GET /vpcs", "client", {}, async () => {
      inside = { headers: traceHeaders(), ids: activeTraceIds() };
    });
    await handle.flush();
    await handle.shutdown();
    expect(inside!.headers.traceparent).toMatch(TRACEPARENT);
    expect(inside!.headers.traceparent).toContain(inside!.ids!.trace_id);
    expect(inside!.headers.baggage).toBeUndefined();
    expect(connect).not.toHaveBeenCalled();
    expect(process.listenerCount("SIGTERM")).toBe(0);
  });

  it("installs once per process: a second register() call returns the live handle and adds no listener", async () => {
    const before = process.listenerCount("SIGTERM");
    const telemetry = startMemoryTelemetry();
    const first = globalThis.__vwsConsoleTelemetry;
    expect(startTelemetry(telemetryConfigFromEnv({}))).toBe(first);
    expect(process.listenerCount("SIGTERM")).toBe(before + 1);
    await withSpan("vws.session", "internal", {}, async () => {});
    expect((await telemetry.spans()).map((span) => span.name)).toEqual(["vws.session"]);
    await telemetry.shutdown();
    expect(process.listenerCount("SIGTERM")).toBe(before);
  });

  it("starts cleanly again after a shutdown, as after a restart, and the old sink gets nothing new", async () => {
    const old = startMemoryTelemetry();
    await withSpan("vws.session", "internal", {}, async () => {});
    const oldSpans = await old.spans();
    await old.shutdown();
    const fresh = startMemoryTelemetry();
    await withSpan("vws.session_check", "internal", {}, async () => {});
    expect(oldSpans.map((span) => span.name)).toEqual(["vws.session"]);
    expect((await fresh.spans()).map((span) => span.name)).toEqual(["vws.session_check"]);
  });

  it("exports only the console's own scope, never Next's spans with raw URLs", async () => {
    const telemetry = startMemoryTelemetry();
    await withSpan("console-api GET /buckets/{name}/objects/{key}", "client", {}, async () => {
      trace
        .getTracer("next.js")
        .startSpan("fetch GET http://api.test/api/v1/buckets/b/objects/SENTINEL-KEY", {
          attributes: { "http.url": "http://api.test/api/v1/buckets/b/objects/SENTINEL-KEY" },
        })
        .end();
    });
    const spans = await telemetry.spans();
    expect(spans.map((span) => span.name)).toEqual(["console-api GET /buckets/{name}/objects/{key}"]);
    expect(JSON.stringify(spans.map((span) => [span.name, span.attributes]))).not.toContain("SENTINEL-KEY");
  });

  it("names the service vws-console unless OTEL_SERVICE_NAME says otherwise", async () => {
    let telemetry = startMemoryTelemetry();
    await withSpan("vws.session", "internal", {}, async () => {});
    expect((await telemetry.spans())[0].resource.attributes["service.name"]).toBe("vws-console");
    await telemetry.shutdown();
    vi.stubEnv("OTEL_SERVICE_NAME", "vws-console-test");
    telemetry = startMemoryTelemetry();
    await withSpan("vws.session", "internal", {}, async () => {});
    expect((await telemetry.spans())[0].resource.attributes["service.name"]).toBe("vws-console-test");
  });

  it("with OTEL_SDK_DISABLED installs no provider: no ids, no traceparent", async () => {
    startTelemetry(telemetryConfigFromEnv({ OTEL_SDK_DISABLED: "true" }));
    const seen = await withSpan("vws.session", "internal", {}, async () => ({
      headers: traceHeaders(),
      ids: activeTraceIds(),
    }));
    expect(seen).toEqual({ headers: {}, ids: null });
  });
});

describe("withSpan", () => {
  it("marks a thrown error as internal without recording its text, and rethrows it unchanged", async () => {
    const telemetry = startMemoryTelemetry();
    const error = new Error("password=SENTINEL");
    await expect(withSpan("vws.session", "internal", {}, async () => Promise.reject(error))).rejects.toBe(error);
    const [span] = await telemetry.spans();
    expect(span.status.code).toBe(2);
    expect(span.attributes["error.type"]).toBe("internal");
    expect(JSON.stringify([span.attributes, span.events, span.status])).not.toContain("SENTINEL");
  });

  it("treats Next's redirect as control flow, not a failure", async () => {
    const telemetry = startMemoryTelemetry();
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    await expect(withSpan("action logoutAction", "internal", {}, async () => Promise.reject(redirect))).rejects.toBe(
      redirect,
    );
    const [span] = await telemetry.spans();
    expect(span.status.code).toBe(0);
    expect(span.attributes["error.type"]).toBeUndefined();
  });
});
