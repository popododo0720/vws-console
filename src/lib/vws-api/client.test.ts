import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSecurityGroup, createVpc, listVpcs } from "./client";

type Call = { url: string; init: RequestInit };

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("console-api client", () => {
  let calls: Call[];

  beforeEach(() => {
    calls = [];
    vi.stubEnv("VWS_CONSOLE_API_URL", "http://api.test/");
    vi.stubEnv("VWS_CONSOLE_API_TOKEN", "tok");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function serve(...replies: Response[]) {
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = replies.shift();
      if (!next) throw new Error("unexpected request");
      return next;
    });
  }

  it("follows page tokens with the bearer token", async () => {
    serve(
      respond(200, { items: [{ vpcId: "vpc-1", cidrBlock: "10.0.0.0/16", state: "available" }], nextPageToken: "p2" }),
      respond(200, { items: [{ vpcId: "vpc-2", cidrBlock: "10.1.0.0/16", state: "pending" }] }),
    );
    const result = await listVpcs();
    expect(result.ok && result.value.map((v) => v.id)).toEqual(["vpc-1", "vpc-2"]);
    expect(calls.map((c) => c.url)).toEqual(["http://api.test/api/v1/vpcs", "http://api.test/api/v1/vpcs?pageToken=p2"]);
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("sends an idempotency key and polls a 202 operation until it succeeds", async () => {
    serve(
      respond(202, { operation: { id: "op-1", state: "running" }, items: [] }),
      respond(200, { id: "op-1", state: "running" }),
      respond(200, { id: "op-1", state: "succeeded" }),
    );
    expect(await createVpc("10.9.0.0/16")).toEqual({ ok: true, value: undefined });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls[0].init.body).toBe('{"cidrBlock":"10.9.0.0/16"}');
    expect(calls.slice(1).map((c) => c.url)).toEqual(["http://api.test/api/v1/operations/op-1", "http://api.test/api/v1/operations/op-1"]);
  });

  it("returns the operation error when the operation fails", async () => {
    serve(respond(202, { operation: { id: "op-2", state: "running" } }), respond(200, { id: "op-2", state: "failed", error: { code: "Conflict", message: "cidr overlaps" } }));
    expect(await createVpc("10.9.0.0/16")).toEqual({ ok: false, error: { code: "Conflict", message: "cidr overlaps", requestId: null } });
  });

  it("returns the API error envelope for a rejected request", async () => {
    serve(respond(400, { error: { code: "InvalidArgument", field: "cidrBlock", message: "must be an ipv4 network" }, requestId: "r-1" }));
    expect(await createVpc("bad")).toEqual({ ok: false, error: { code: "InvalidArgument", message: "must be an ipv4 network", requestId: "r-1" } });
  });

  it("reports missing configuration without calling the API", async () => {
    vi.stubEnv("VWS_CONSOLE_API_TOKEN", "");
    serve();
    const result = await listVpcs();
    expect(result).toEqual({ ok: false, error: { code: "ConsoleNotConfigured", message: "Set VWS_CONSOLE_API_TOKEN on the console server.", requestId: null } });
    expect(calls).toEqual([]);
  });

  it("returns the new security group ID from the accepted request", async () => {
    serve(
      respond(202, { operation: { id: "op-4", state: "running" }, items: [{ groupId: "sg-9", groupName: "web", vpcId: "vpc-1" }] }),
      respond(200, { id: "op-4", state: "succeeded" }),
    );
    expect(await createSecurityGroup("web", "vpc-1")).toEqual({ ok: true, value: "sg-9" });
    expect(calls[0].init.body).toBe('{"groupName":"web","vpcId":"vpc-1"}');
  });
});
