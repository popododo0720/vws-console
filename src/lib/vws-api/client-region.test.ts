// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ path: "/compute/instances" as string | null }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(nav.path === null ? {} : { "x-vws-path": nav.path }),
}));

import { createVpc, getInstance, listInstances, listRegions } from "./client";

type Call = { method: string; path: string; region: string | undefined; signal: unknown };

const listed = [
  { name: "pve-busan-1", kind: "pve", state: "degraded" },
  { name: "pve-seoul-1", kind: "pve", state: "available" },
  { name: "us-east-1", kind: "aws", state: "unavailable" },
];
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const denied = () => json(403, { error: { code: "PermissionDenied", message: "ec2:DescribeRegions is not allowed" } });

function serve(regions: () => Response = () => json(200, { items: listed })) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname.replace("/api/v1", "");
    const region = (init.headers as Record<string, string>)["x-vws-region"];
    calls.push({ method: init.method ?? "GET", path, region, signal: init.signal });
    if (path === "/regions") return regions();
    if (path === "/vpcs") return json(202, { operation: { id: "op-1", state: "running" }, items: [] });
    if (path === "/operations/op-1") return json(200, { id: "op-1", state: "succeeded" });
    return json(200, { items: [] });
  });
  return calls;
}

const sent = (calls: Call[]) => calls.filter((call) => call.path !== "/regions").map((call) => call.region);

describe("the region a console-api call is sent to", () => {
  beforeEach(() => {
    vi.stubEnv("VWS_CONSOLE_API_URL", "http://api.test");
    vi.stubEnv("VWS_CONSOLE_API_TOKEN", "tok");
    vi.stubEnv("VWS_CONSOLE_IAM", "off");
    nav.path = "/compute/instances";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the region of ?region= on every call, and reads the list once for an operation and its polls", async () => {
    nav.path = "/compute/instances?tab=a&region=pve-seoul-1";
    const calls = serve();
    await listInstances();
    await getInstance("i-1");
    vi.useFakeTimers();
    const created = createVpc("10.0.0.0/16");
    await vi.advanceTimersByTimeAsync(500);
    expect(await created).toEqual({ ok: true, value: undefined });
    expect(calls.map((call) => `${call.method} ${call.path} ${call.region ?? "-"}`)).toEqual([
      "GET /regions -",
      "GET /instances pve-seoul-1",
      "GET /regions -",
      "GET /instances/i-1 pve-seoul-1",
      "GET /regions -",
      "POST /vpcs pve-seoul-1",
      "GET /operations/op-1 pve-seoul-1",
    ]);
    expect(calls.every((call) => call.signal instanceof AbortSignal)).toBe(true);
  });

  it.each([
    ["no ?region=", "/compute/instances"],
    ["an unknown name", "/compute/instances?region=pve-nowhere-9"],
    ["a name in another case", "/compute/instances?region=PVE-SEOUL-1"],
    ["a header injection", "/compute/instances?region=pve-seoul-1%0D%0Ax-evil%3A%201"],
    ["an empty value", "/compute/instances?region="],
  ])("falls back to the first listed region for %s, without an error", async (_case, path) => {
    nav.path = path;
    const calls = serve();
    expect(await listInstances()).toEqual({ ok: true, value: [] });
    expect(sent(calls)).toEqual(["pve-busan-1"]);
  });

  it("sends no region, and still lists, when console-api lists no usable name", async () => {
    nav.path = "/compute/instances?region=pve-seoul-1";
    const unusable = [
      denied,
      () => json(200, { regions: [] }),
      () => json(200, { items: [{ name: "pve-seoul-1\r\nx-evil: 1" }, { name: "all" }, { name: "" }] }),
    ];
    for (const regions of unusable) {
      const calls = serve(regions);
      expect(await listInstances()).toEqual({ ok: true, value: [] });
      expect(sent(calls)).toEqual([undefined]);
    }
  });

  it("sends all for All regions, also when the list could not be read", async () => {
    nav.path = "/compute/instances?region=all";
    for (const regions of [undefined, denied]) {
      const calls = serve(regions);
      await listInstances();
      expect(sent(calls)).toEqual(["all"]);
    }
  });

  it("answers one available region and calls nothing when no console-api is configured", async () => {
    vi.stubEnv("VWS_CONSOLE_API_URL", "");
    const calls = serve();
    expect(await listRegions()).toEqual({ ok: true, value: [{ name: "vws-1", kind: "pve", state: "available" }] });
    expect(calls).toEqual([]);
  });
});
