// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "http://console.test", host: "127.0.0.1:3000" }),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));

import { NextRequest } from "next/server";
import { startMemoryTelemetry, type MemoryTelemetry } from "@/lib/ops/memory-telemetry";
import { listSubnets, listVpcs, signedInSession } from "@/lib/vws-api/client";
import { resetIamModeCache } from "@/lib/vws-api/mode";
import { proxy } from "@/proxy";
import { loginAction, logoutAction } from "./auth";
import { createVpcAction } from "./resources";

const PASSWORD = "pw-SENTINEL-7f3a";
const MFA = "918273";
const SESSION = "sess-SENTINEL-41c2";
const CSRF = "csrf-SENTINEL-9d0e";
const BEARER = "tok-SENTINEL-b77e";
const SENTINELS = [PASSWORD, MFA, SESSION, CSRF, BEARER];

type Sent = { method: string; path: string; headers: Record<string, string>; body: string };

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** A deterministic console-api: GET /vpcs answers 503 once, GET /subnets never answers. */
function fakeConsoleApi(sent: Sent[]) {
  let vpcs = 0;
  return async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname.replace("/api/v1", "");
    const method = init.method ?? "GET";
    sent.push({ method, path, headers: init.headers as Record<string, string>, body: String(init.body ?? "") });
    const route = `${method} ${path}`;
    if (route === "POST /auth/login") {
      const response = json(200, { loginEnabled: true, principal: "root" });
      response.headers.append("set-cookie", `vws_session=${SESSION}; Path=/; HttpOnly; Max-Age=3600`);
      response.headers.append("set-cookie", `vws_csrf=${CSRF}; Path=/; HttpOnly; Max-Age=3600`);
      return response;
    }
    if (route === "GET /auth/session") {
      const cookie = (init.headers as Record<string, string>).cookie ?? "";
      const bearer = (init.headers as Record<string, string>).authorization;
      if (bearer === `Bearer ${BEARER}`) return json(200, { loginEnabled: false, principal: "root", account: "1" });
      if (cookie.includes(`vws_session=${SESSION}`) && jar.size > 0) return json(200, { principal: "root" });
      return json(401, { error: { code: "Unauthenticated", message: `session ${SESSION} expired` } });
    }
    if (route === "GET /vpcs") return ++vpcs === 1 ? json(503, {}) : json(200, { items: [] });
    if (route === "POST /vpcs") return json(202, { operation: { id: "op-1", state: "running" }, items: [] });
    if (route === "GET /operations/op-1") return json(200, { id: "op-1", state: "succeeded" });
    if (route === "POST /auth/logout") return json(200, {});
    if (route === "GET /subnets") {
      return new Promise<Response>((_, reject) =>
        init.signal!.addEventListener("abort", () => reject(init.signal!.reason)),
      );
    }
    return json(404, { error: { code: "NotFound" } });
  };
}

describe("the auth flow under telemetry", () => {
  let telemetry: MemoryTelemetry;
  let sent: Sent[];
  let logs: string[];

  beforeEach(() => {
    jar.clear();
    sent = [];
    logs = [];
    resetIamModeCache();
    telemetry = startMemoryTelemetry();
    vi.stubEnv("VWS_CONSOLE_API_URL", "http://api.test");
    vi.stubEnv("VWS_CONSOLE_IAM", "on");
    vi.stubGlobal("fetch", fakeConsoleApi(sent));
    for (const level of ["info", "warn"] as const) {
      vi.spyOn(console, level).mockImplementation((line: unknown) => void logs.push(String(line)));
    }
  });

  afterEach(async () => {
    await telemetry.shutdown();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function runFlow() {
    const form = new FormData();
    for (const [name, value] of Object.entries({ account: "1", userName: "root", password: PASSWORD, mfaCode: MFA }))
      form.set(name, value);
    expect(await loginAction({ error: null }, form)).toEqual({ error: null, next: "/" });
    expect(await signedInSession()).toMatchObject({ principal: "root" });
    expect((await listVpcs()).ok).toBe(true);
    expect(await createVpcAction("10.0.0.0/16")).toBeNull();
    vi.stubEnv("VWS_CONSOLE_API_TIMEOUT_MS", "20");
    expect(await listSubnets()).toMatchObject({ ok: false, error: { code: "RequestTimeout" } });
    vi.stubEnv("VWS_CONSOLE_API_TIMEOUT_MS", "");
    await expect(logoutAction()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
    jar.clear();
    const expired = await proxy(
      new NextRequest("http://console.test/login?reason=expired", { headers: { cookie: `vws_session=${SESSION}` } }),
    );
    expect(expired.headers.getSetCookie().join()).toContain("vws_session=;");
    vi.stubEnv("VWS_CONSOLE_IAM", "off");
    vi.stubEnv("VWS_CONSOLE_API_TOKEN", BEARER);
    expect(await signedInSession()).toMatchObject({ principal: "root" });
  }

  it("emits the expected spans, attributes and the six metrics for sign-in, a retried GET, a write and a timeout", async () => {
    await runFlow();
    const spans = await telemetry.spans();
    const named = (name: string) => spans.filter((span) => span.name === name);
    expect(spans.map((span) => span.name)).toEqual(
      expect.arrayContaining([
        "action loginAction",
        "console-api POST /auth/login",
        "vws.session",
        "console-api GET /auth/session",
        "console-api GET /vpcs",
        "action createVpcAction",
        "console-api POST /vpcs",
        "console-api GET /operations/{id}",
        "console-api GET /subnets",
        "action logoutAction",
        "console-api POST /auth/logout",
        "vws.session_check",
      ]),
    );
    const [signIn] = named("console-api POST /auth/login");
    expect(signIn.attributes).toMatchObject({
      "http.request.method": "POST",
      "url.template": "/auth/login",
      "http.response.status_code": 200,
      "vws.attempts": 1,
      "vws.iam_mode": "on",
    });
    expect(signIn.parentSpanContext?.spanId).toBe(named("action loginAction")[0].spanContext().spanId);
    const [retried] = named("console-api GET /vpcs");
    expect(retried.attributes["vws.attempts"]).toBe(2);
    expect(retried.events).toHaveLength(1);
    expect(retried.events[0].attributes).toMatchObject({ attempt: 2, reason: "5xx" });
    expect(retried.events[0].attributes?.backoff_ms).toBeTypeOf("number");
    const [write] = named("console-api POST /vpcs");
    expect(write.attributes).toMatchObject({ "vws.attempts": 1, "http.response.status_code": 202 });
    expect(write.parentSpanContext?.spanId).toBe(named("action createVpcAction")[0].spanContext().spanId);
    const [timedOut] = named("console-api GET /subnets");
    expect(timedOut.attributes).toMatchObject({ "error.type": "timeout", "vws.attempts": 3 });
    expect(named("action logoutAction")[0].status.code).toBe(0);
    expect(named("vws.session_check")[0].attributes["vws.outcome"]).toBe("rejected");

    expect(await telemetry.metricNames()).toEqual(
      expect.arrayContaining([
        "vws_console_api_requests_total",
        "vws_console_api_request_duration_seconds",
        "vws_console_api_retries_total",
        "vws_console_api_timeouts_total",
        "vws_console_auth_events_total",
        "vws_console_operation_poll_duration_seconds",
      ]),
    );
    expect((await telemetry.points("vws_console_auth_events_total")).map((p) => p.attributes)).toEqual(
      expect.arrayContaining([
        { event: "login", outcome: "success" },
        { event: "session", outcome: "success" },
        { event: "logout", outcome: "success" },
        { event: "expired_cookie_cleared", outcome: "success" },
      ]),
    );
    expect((await telemetry.points("vws_console_api_timeouts_total"))[0].value).toBe(3);
    expect((await telemetry.points("vws_console_operation_poll_duration_seconds"))[0].value).toMatchObject({
      count: 1,
    });
  });

  it("puts the active span's trace_id and span_id on every auth log line", async () => {
    await runFlow();
    const spans = await telemetry.spans();
    const lines = logs.map((line) => JSON.parse(line) as Record<string, unknown>);
    const auth = lines.filter((line) => String(line.event).startsWith("auth."));
    expect(auth.map((line) => line.event)).toEqual(
      expect.arrayContaining(["auth.login", "auth.session", "auth.logout", "auth.expired_cookie_cleared"]),
    );
    for (const line of auth) {
      expect(line.trace_id).toMatch(/^[0-9a-f]{32}$/);
      expect(line.span_id).toMatch(/^[0-9a-f]{16}$/);
    }
    const login = auth.find((line) => line.event === "auth.login")!;
    const action = spans.find((span) => span.name === "action loginAction")!;
    expect([login.trace_id, login.span_id]).toEqual([action.spanContext().traceId, action.spanContext().spanId]);
    expect(Object.keys(login).sort()).toEqual(
      ["durationMs", "event", "level", "outcome", "requestId", "service", "span_id", "status", "trace_id"].sort(),
    );
  });

  it("never exports or logs a password, MFA code, session, CSRF value or bearer token", async () => {
    await runFlow();
    const outgoing = JSON.stringify(sent);
    for (const secret of SENTINELS) expect(outgoing, "the flow really sent it").toContain(secret);

    const spans = await telemetry.spans();
    const metricData = await Promise.all(
      (await telemetry.metricNames()).map(async (name) => [name, await telemetry.points(name)]),
    );
    const exported = JSON.stringify({
      spans: spans.map((span) => ({
        name: span.name,
        attributes: span.attributes,
        events: span.events,
        status: span.status,
        resource: span.resource.attributes,
      })),
      metrics: metricData,
      logs,
    });
    for (const secret of SENTINELS) expect(exported).not.toContain(secret);
    expect(exported).not.toMatch(/Bearer|vws_session=|vws_csrf=/);
  });
});
