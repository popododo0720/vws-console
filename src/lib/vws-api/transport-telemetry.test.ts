// @vitest-environment node
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startMemoryTelemetry, type MemoryTelemetry } from "@/lib/ops/memory-telemetry";
import { keyPath, route } from "./route";
import { apiFetch, ApiTransportError } from "./transport";

const BASE = "http://api.test";
let telemetry: MemoryTelemetry;
let sent: { url: string; headers: Record<string, string> }[];

function serve(...replies: (() => Promise<Response>)[]) {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    sent.push({ url, headers: init.headers as Record<string, string> });
    const next = replies.shift();
    if (!next) throw new Error("unexpected request");
    return next();
  });
}

const reply =
  (status: number, body: unknown = {}) =>
  async () =>
    new Response(JSON.stringify(body), { status });
const hang = () => (_url: string, init: RequestInit) =>
  new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)));

beforeEach(() => {
  sent = [];
  telemetry = startMemoryTelemetry();
});

afterEach(async () => {
  await telemetry.shutdown();
  vi.unstubAllGlobals();
});

async function onlySpan() {
  const spans = await telemetry.spans();
  expect(spans).toHaveLength(1);
  return spans[0];
}

describe("apiFetch telemetry", () => {
  it("retries a GET after a 503 with one retry event carrying the exact backoff", async () => {
    serve(reply(503), reply(200, { items: [] }));
    const sleeps: number[] = [];
    const answer = await apiFetch(
      BASE,
      route("/vpcs"),
      {},
      { iamMode: "on", sleep: async (ms) => void sleeps.push(ms), random: () => 0.5 },
    );
    expect(answer.attempts).toBe(2);
    const span = await onlySpan();
    expect(span.name).toBe("console-api GET /vpcs");
    expect(span.kind).toBe(SpanKind.CLIENT);
    expect(span.attributes).toEqual({
      "http.request.method": "GET",
      "url.template": "/vpcs",
      "vws.request_id": answer.requestId,
      "vws.iam_mode": "on",
      "http.response.status_code": 200,
      "vws.attempts": 2,
    });
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
    expect(span.events.map((event) => [event.name, event.attributes])).toEqual([
      ["retry", { attempt: 2, reason: "5xx", backoff_ms: sleeps[0] }],
    ]);
    expect(sleeps).toEqual([100]);
    expect((await telemetry.points("vws_console_api_retries_total")).map((p) => [p.attributes, p.value])).toEqual([
      [{ route: "/vpcs", reason: "5xx" }, 1],
    ]);
    expect((await telemetry.points("vws_console_api_requests_total")).map((p) => [p.attributes, p.value])).toEqual([
      [{ method: "GET", route: "/vpcs", status_class: "2xx", outcome: "success" }, 1],
    ]);
  });

  it("sends a write exactly once, even on a 503, and marks the span with console-api's code", async () => {
    serve(reply(503, { error: { code: "ServiceUnavailable", message: "busy" } }));
    const answer = await apiFetch(BASE, route("/vpcs/{id}/delete", { id: "vpc-1" }), { method: "POST" }, {});
    expect(answer.status).toBe(503);
    expect(sent).toHaveLength(1);
    const span = await onlySpan();
    expect(span.name).toBe("console-api POST /vpcs/{id}/delete");
    expect(span.attributes["vws.attempts"]).toBe(1);
    expect(span.attributes["error.type"]).toBe("ServiceUnavailable");
    expect(span.attributes["vws.iam_mode"]).toBe("unknown");
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.events).toEqual([]);
    expect(await telemetry.points("vws_console_api_retries_total")).toEqual([]);
  });

  it("keeps a 4xx out of ERROR but names it, so mode detection's 401 does not paint traces red", async () => {
    serve(reply(401, { error: { code: "Unauthenticated" } }));
    await apiFetch(BASE, route("/auth/session"), {}, { retry: false });
    const span = await onlySpan();
    expect(span.attributes["error.type"]).toBe("Unauthenticated");
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
  });

  it("counts every timed-out attempt and ends the call as a timeout", async () => {
    vi.stubGlobal("fetch", hang());
    const error = await apiFetch(BASE, route("/subnets"), {}, { timeoutMs: 5, sleep: async () => {} }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiTransportError);
    const span = await onlySpan();
    expect(span.attributes["error.type"]).toBe("timeout");
    expect(span.attributes["vws.attempts"]).toBe(3);
    expect(span.attributes["http.response.status_code"]).toBeUndefined();
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.events.map((event) => event.attributes?.reason)).toEqual(["timeout", "timeout"]);
    expect((await telemetry.points("vws_console_api_timeouts_total")).map((p) => [p.attributes, p.value])).toEqual([
      [{ method: "GET", route: "/subnets" }, 3],
    ]);
    expect((await telemetry.points("vws_console_api_requests_total")).map((p) => p.attributes)).toEqual([
      { method: "GET", route: "/subnets", status_class: "none", outcome: "timeout" },
    ]);
  });

  it("sends W3C traceparent for the call's span on every attempt, beside X-Request-Id, never baggage", async () => {
    serve(reply(502), reply(200));
    await apiFetch(
      BASE,
      route("/vpcs"),
      { headers: { traceparent: "00-ffffffffffffffffffffffffffffffff-ffffffffffffffff-01" } },
      { sleep: async () => {} },
    );
    const span = await onlySpan();
    const { traceId, spanId } = span.spanContext();
    expect(sent).toHaveLength(2);
    for (const { headers } of sent) {
      expect(headers.traceparent).toBe(`00-${traceId}-${spanId}-01`);
      expect(headers["x-request-id"]).toBe(span.attributes["vws.request_id"]);
    }
    expect(sent.map(({ headers }) => headers.baggage)).toEqual([undefined, undefined]);
  });

  it("never puts an ID, object key or query in a span name or label, however hostile", async () => {
    const id = "../../etc/passwd?token=SENTINEL-ID#x";
    const key = "a/../../b?X-Amz-Signature=SENTINEL-KEY";
    serve(reply(404), reply(500), reply(500), reply(500));
    await apiFetch(BASE, route("/vpcs/{id}", { id }), {}, { retry: false });
    await apiFetch(
      BASE,
      route("/buckets/{name}/objects/{key}", { name: "b", key: keyPath(key) }),
      {},
      {
        sleep: async () => {},
      },
    );
    expect(sent[0].url).toBe(`${BASE}/api/v1/vpcs/${encodeURIComponent(id)}`);
    const spans = await telemetry.spans();
    expect(spans.map((span) => span.name)).toEqual([
      "console-api GET /vpcs/{id}",
      "console-api GET /buckets/{name}/objects/{key}",
    ]);
    const exported = JSON.stringify([
      spans.map((span) => [span.name, span.attributes, span.events]),
      await telemetry.points("vws_console_api_requests_total"),
      await telemetry.points("vws_console_api_retries_total"),
      await telemetry.points("vws_console_api_request_duration_seconds"),
    ]);
    expect(exported).not.toMatch(/SENTINEL|passwd|\.\.\//);
  });
});
