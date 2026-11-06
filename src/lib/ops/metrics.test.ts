// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { startMemoryTelemetry } from "./memory-telemetry";
import {
  METRIC_DEFS,
  METRIC_PREFIX,
  consoleMetrics,
  methodLabel,
  recordApiCall,
  recordApiRetry,
  recordApiTimeout,
  recordAuthEvent,
  recordHttpRequest,
  recordOperationPoll,
  statusClass,
} from "./metrics";

afterEach(async () => {
  await globalThis.__vwsConsoleTelemetry?.shutdown();
});

/** Metric names from the exposition text: every `# HELP`/`# TYPE` line and every sample line. */
function metricNames(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => (line.startsWith("#") ? line.split(" ")[2] : line.split(/[{ ]/)[0]));
}

const exposition = () => consoleMetrics().registry.metrics();

describe("console metrics", () => {
  it("prefixes every metric name with vws_console_", async () => {
    recordHttpRequest("GET");
    recordApiCall({ method: "GET", route: "/vpcs", status: 200, kind: null, seconds: 0.02 });
    const names = metricNames(await exposition());
    expect(names.length).toBeGreaterThan(10);
    expect(names.filter((name) => !name.startsWith(METRIC_PREFIX))).toEqual([]);
    expect(names).toContain("vws_console_http_requests_total");
    expect(names).toContain("vws_console_api_requests_total");
    expect(names).toContain("vws_console_api_request_duration_seconds_bucket");
    expect(names).toContain("vws_console_process_cpu_user_seconds_total");
  });

  it("counts requests by method and calls by method, route template, status class and outcome", async () => {
    recordHttpRequest("post");
    recordHttpRequest("BREW");
    recordApiCall({ method: "GET", route: "/vpcs/{id}", status: null, kind: "timeout", seconds: 2 });
    recordApiCall({ method: "POST", route: "/vpcs", status: 409, kind: null, seconds: 0.1 });
    recordApiRetry("/vpcs/{id}", "5xx");
    recordApiTimeout("GET", "/vpcs/{id}");
    recordAuthEvent("login", "success");
    recordOperationPoll(1.5);
    const text = await exposition();
    expect(text).toMatch(/^vws_console_http_requests_total\{method="POST"\} [1-9]/m);
    expect(text).toMatch(/^vws_console_http_requests_total\{method="OTHER"\} [1-9]/m);
    expect(text).toMatch(
      /^vws_console_api_requests_total\{method="GET",route="\/vpcs\/\{id\}",status_class="none",outcome="timeout"\} [1-9]/m,
    );
    expect(text).toMatch(
      /^vws_console_api_requests_total\{method="POST",route="\/vpcs",status_class="4xx",outcome="failure"\} [1-9]/m,
    );
    expect(text).toMatch(
      /^vws_console_api_request_duration_seconds_count\{method="GET",route="\/vpcs\/\{id\}"\} [1-9]/m,
    );
    expect(text).toMatch(/^vws_console_api_retries_total\{route="\/vpcs\/\{id\}",reason="5xx"\} [1-9]/m);
    expect(text).toMatch(/^vws_console_api_timeouts_total\{method="GET",route="\/vpcs\/\{id\}"\} [1-9]/m);
    expect(text).toMatch(/^vws_console_auth_events_total\{event="login",outcome="success"\} [1-9]/m);
    expect(text).toMatch(/^vws_console_operation_poll_duration_seconds_count [1-9]/m);
  });

  it("writes the same samples to the OTel meter, with the same names and labels", async () => {
    const telemetry = startMemoryTelemetry();
    recordApiCall({ method: "GET", route: "/vpcs", status: 503, kind: null, seconds: 0.3 });
    recordAuthEvent("session", "error");
    recordOperationPoll(2);
    expect((await telemetry.metricNames()).sort()).toEqual(
      ["api_requests_total", "api_request_duration_seconds", "auth_events_total", "operation_poll_duration_seconds"]
        .map((name) => `${METRIC_PREFIX}${name}`)
        .sort(),
    );
    expect((await telemetry.points("vws_console_api_requests_total")).map((point) => point.attributes)).toEqual([
      { method: "GET", route: "/vpcs", status_class: "5xx", outcome: "failure" },
    ]);
    expect(Object.keys(METRIC_DEFS)).toHaveLength(7);
  });

  it("keeps one registry across module reloads (dev HMR)", () => {
    expect(consoleMetrics()).toBe(globalThis.__vwsConsoleMetrics);
    expect(consoleMetrics().registry).toBe(consoleMetrics().registry);
  });

  it("maps statuses to classes and unknown methods to OTHER", () => {
    expect([199, 204, 302, 404, 503, null].map(statusClass)).toEqual(["1xx", "2xx", "3xx", "4xx", "5xx", "none"]);
    expect(methodLabel("delete")).toBe("DELETE");
    expect(methodLabel("PROPFIND")).toBe("OTHER");
  });
});
