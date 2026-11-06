// @vitest-environment node
import { context, propagation, ROOT_CONTEXT } from "@opentelemetry/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startMemoryTelemetry, type MemoryTelemetry } from "@/lib/ops/memory-telemetry";
import { logAuth } from "@/lib/vws-api/log";
import { route } from "@/lib/vws-api/route";
import { apiFetch } from "@/lib/vws-api/transport";

let telemetry: MemoryTelemetry;
let sent: Record<string, string>[];

beforeEach(() => {
  sent = [];
  telemetry = startMemoryTelemetry();
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    sent.push(init.headers as Record<string, string>);
    return new Response("{}", { status: 200 });
  });
});

afterEach(async () => {
  await telemetry.shutdown();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const BROWSER_TRACE = "0af7651916cd43dd8448eb211c80319c";

/** What Next's base-server does for every request: propagation.extract on the incoming headers. */
function asNextWould<T>(incoming: Record<string, string>, run: () => Promise<T>): Promise<T> {
  return context.with(propagation.extract(ROOT_CONTEXT, incoming), run);
}

describe("a traceparent sent by the browser", () => {
  it("cannot switch off console spans with flags 00", async () => {
    await asNextWould({ traceparent: `00-${BROWSER_TRACE}-b7ad6b7169203331-00` }, () =>
      apiFetch("http://api.test", route("/vpcs"), {}, { iamMode: "on" }),
    );
    expect((await telemetry.spans()).map((span) => span.name)).toEqual(["console-api GET /vpcs"]);
    expect(sent[0].traceparent).toMatch(/-01$/);
  });

  it("does not become the trace id in auth logs or on console-api calls", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "info").mockImplementation((line: string) => void lines.push(line));
    await asNextWould({ traceparent: `00-${BROWSER_TRACE}-b7ad6b7169203331-01` }, async () => {
      await apiFetch("http://api.test", route("/auth/session"), {}, { iamMode: "on" });
      logAuth({ event: "auth.session", outcome: "success", status: 200, requestId: "r", durationMs: 1 });
    });
    expect(sent[0].traceparent).not.toContain(BROWSER_TRACE);
    expect(lines.join("\n")).not.toContain(BROWSER_TRACE);
  });
});
