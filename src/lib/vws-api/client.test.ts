import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSubnet, createSubnetTags, createVpcTags, createInstanceTags, createSecurityGroup, createVpc, getVolume, getVpc, instanceBatch, launchInstances, listVpcs, modifyVolume } from "./client";

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

  it("launches with tags only when there are some", async () => {
    serve(respond(202, { operation: { id: "op-3", state: "succeeded" } }), respond(202, { operation: { id: "op-4", state: "succeeded" } }));
    const req = { imageId: "ami-1", instanceType: "vws.small", subnetId: "subnet-1", count: 2 };
    await launchInstances({ ...req, tags: { Name: "web" } });
    await launchInstances({ ...req, tags: {} });
    expect(calls.map((c) => [c.url, c.init.body])).toEqual([
      ["http://api.test/api/v1/instances", '{"imageId":"ami-1","instanceType":"vws.small","subnetId":"subnet-1","count":2,"tags":{"Name":"web"}}'],
      ["http://api.test/api/v1/instances", '{"imageId":"ami-1","instanceType":"vws.small","subnetId":"subnet-1","count":2}'],
    ]);
  });

  it("stops instances in batches of 20 with one operation per batch", async () => {
    const ids = Array.from({ length: 21 }, (_, index) => `i-${index}`);
    serve(
      respond(202, { operation: { id: "op-a", state: "running" }, items: [] }),
      respond(200, { id: "op-a", state: "succeeded" }),
      respond(202, { operation: { id: "op-b", state: "succeeded" }, items: [] }),
    );
    expect(await instanceBatch("stop", ids)).toEqual({ ok: true, value: undefined });
    expect(calls.map((c) => c.url)).toEqual([
      "http://api.test/api/v1/instances/stop",
      "http://api.test/api/v1/operations/op-a",
      "http://api.test/api/v1/instances/stop",
    ]);
    expect(JSON.parse(calls[0].init.body as string).instanceIds).toHaveLength(20);
    expect(JSON.parse(calls[2].init.body as string).instanceIds).toEqual(["i-20"]);
    const keys = [calls[0], calls[2]].map((c) => (c.init.headers as Record<string, string>)["idempotency-key"]);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("stops at the first failed batch", async () => {
    const ids = Array.from({ length: 25 }, (_, index) => `i-${index}`);
    serve(respond(202, { operation: { id: "op-c", state: "running" } }), respond(200, { id: "op-c", state: "failed", error: { code: "Conflict", message: "busy" } }));
    expect(await instanceBatch("terminate", ids)).toEqual({ ok: false, error: { code: "Conflict", message: "busy", requestId: null } });
    expect(calls).toHaveLength(2);
  });

  it("writes the Name tag to the instance tags endpoint", async () => {
    serve(respond(202, { operation: { id: "op-t", state: "succeeded" }, items: [] }));
    expect(await createInstanceTags("i-1", { Name: "web" })).toEqual({ ok: true, value: undefined });
    expect(calls[0].url).toBe("http://api.test/api/v1/instances/i-1/tags");
    expect(calls[0].init.body).toBe('{"tags":{"Name":"web"}}');
  });

  it("reads one VPC and one volume, and treats a 404 as missing", async () => {
    serve(
      respond(200, { vpcId: "vpc-1", cidrBlock: "10.0.0.0/16", state: "available", isDefault: true }),
      respond(404, { error: { code: "NotFound", message: "no such volume" }, requestId: "r-2" }),
    );
    const vpc = await getVpc("vpc-1");
    expect(vpc.ok && vpc.value?.ipv4Cidr).toBe("10.0.0.0/16");
    expect(vpc.ok && vpc.value?.isDefault).toBe(true);
    expect(await getVolume("vol-x")).toEqual({ ok: true, value: null });
    expect(calls.map((c) => c.url)).toEqual(["http://api.test/api/v1/vpcs/vpc-1", "http://api.test/api/v1/volumes/vol-x"]);
  });

  it("sends the new size to the modify endpoint", async () => {
    serve(respond(202, { operation: { id: "op-5", state: "running" }, items: [] }), respond(200, { id: "op-5", state: "succeeded" }));
    expect(await modifyVolume("vol-1", 9)).toEqual({ ok: true, value: undefined });
    expect(calls[0].url).toBe("http://api.test/api/v1/volumes/vol-1/modify");
    expect(calls[0].init.body).toBe('{"size":9}');
  });

  it("sends a Name tag on create and renames VPCs and subnets through their tags endpoints", async () => {
    const ok = () => respond(202, { operation: { id: "op-n", state: "succeeded" }, items: [] });
    serve(ok(), ok(), ok(), ok());
    await createVpc("10.9.0.0/16", { Name: "prod" });
    await createSubnet("vpc-1", "10.9.1.0/24");
    await createVpcTags("vpc-1", { Name: "prod2" });
    await createSubnetTags("subnet-1", { Name: "web" });
    expect(calls.map((c) => [c.url.replace("http://api.test/api/v1", ""), c.init.body])).toEqual([
      ["/vpcs", '{"cidrBlock":"10.9.0.0/16","tags":{"Name":"prod"}}'],
      ["/subnets", '{"vpcId":"vpc-1","cidrBlock":"10.9.1.0/24"}'],
      ["/vpcs/vpc-1/tags", '{"tags":{"Name":"prod2"}}'],
      ["/subnets/subnet-1/tags", '{"tags":{"Name":"web"}}'],
    ]);
  });
});
