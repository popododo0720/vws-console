// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GET } from "@/app/metrics/route";
import { METRIC_PREFIX, consoleMetrics, methodLabel, recordApiCall, recordHttpRequest, statusOutcome } from "./metrics";

/** Metric names from the exposition text: every `# HELP`/`# TYPE` line and every sample line. */
function metricNames(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => (line.startsWith("#") ? line.split(" ")[2] : line.split(/[{ ]/)[0]));
}

describe("/metrics", () => {
  it("answers 200 Prometheus text, uncached", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/plain; version=0\.0\.4/);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("prefixes every metric name with vws_console_", async () => {
    recordHttpRequest("GET");
    recordApiCall({ method: "GET", outcome: "2xx", seconds: 0.02 });
    const names = metricNames(await (await GET()).text());
    expect(names.length).toBeGreaterThan(10);
    expect(names.filter((name) => !name.startsWith(METRIC_PREFIX))).toEqual([]);
    expect(names).toContain("vws_console_http_requests_total");
    expect(names).toContain("vws_console_api_requests_total");
    expect(names).toContain("vws_console_api_request_duration_seconds_bucket");
    expect(names).toContain("vws_console_process_cpu_user_seconds_total");
  });

  it("counts requests by method and calls by outcome", async () => {
    recordHttpRequest("post");
    recordHttpRequest("BREW");
    recordApiCall({ method: "GET", outcome: "timeout", seconds: 2 });
    const text = await (await GET()).text();
    expect(text).toMatch(/^vws_console_http_requests_total\{method="POST"\} [1-9]/m);
    expect(text).toMatch(/^vws_console_http_requests_total\{method="OTHER"\} [1-9]/m);
    expect(text).toMatch(/^vws_console_api_requests_total\{method="GET",outcome="timeout"\} [1-9]/m);
  });

  it("keeps one registry across module reloads (dev HMR)", () => {
    expect(consoleMetrics()).toBe(globalThis.__vwsConsoleMetrics);
    expect(consoleMetrics().registry).toBe(consoleMetrics().registry);
  });

  it("maps statuses to classes and unknown methods to OTHER", () => {
    expect([199, 204, 302, 404, 503].map(statusOutcome)).toEqual(["1xx", "2xx", "3xx", "4xx", "5xx"]);
    expect(methodLabel("delete")).toBe("DELETE");
    expect(methodLabel("PROPFIND")).toBe("OTHER");
  });
});
