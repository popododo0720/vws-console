import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const nav = vi.hoisted(() => ({
  session: { session: "sess-1", csrf: "csrf-1" } as { session: string; csrf: string } | null,
  path: "/network/vpcs" as string | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ ...(nav.path ? { "x-vws-path": nav.path } : {}), origin: "http://console.test" }),
}));
vi.mock("./session", () => ({ currentSession: async () => nav.session }));

import type { CreateAttempt, IdempotencyKey, KeyPairId, KeyPairName } from "@/lib/key-pair";
import { parseBucketName, type BucketName } from "./adapter";
import {
  login,
  logout,
  signedInSession,
  createKeyPair,
  createSubnet,
  createSubnetTags,
  createVpcTags,
  createInstanceTags,
  createSecurityGroup,
  createVpc,
  deleteKeyPair,
  deleteBucket,
  deleteObject,
  getBucket,
  getObject,
  getVolume,
  getVpc,
  instanceBatch,
  launchInstances,
  listKeyPairs,
  listBuckets,
  listVpcs,
  modifyVolume,
  attachVolume,
  detachVolume,
  putBucket,
  putObject,
} from "./client";

function mustName(input: string): BucketName {
  const name = parseBucketName(input);
  if (!name) throw new Error(input);
  return name;
}

type Call = { url: string; init: RequestInit };

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("console-api client", () => {
  let calls: Call[];

  beforeEach(() => {
    calls = [];
    vi.stubEnv("VWS_CONSOLE_API_URL", "http://api.test/");
    vi.stubEnv("VWS_CONSOLE_IAM", "on");
    nav.session = { session: "sess-1", csrf: "csrf-1" };
    nav.path = "/network/vpcs";
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

  it("follows page tokens with the forwarded session cookie and no bearer token", async () => {
    serve(
      respond(200, { items: [{ vpcId: "vpc-1", cidrBlock: "10.0.0.0/16", state: "available" }], nextPageToken: "p2" }),
      respond(200, { items: [{ vpcId: "vpc-2", cidrBlock: "10.1.0.0/16", state: "pending" }] }),
    );
    const result = await listVpcs();
    expect(result.ok && result.value.map((v) => v.id)).toEqual(["vpc-1", "vpc-2"]);
    expect(calls.map((c) => c.url)).toEqual([
      "http://api.test/api/v1/vpcs",
      "http://api.test/api/v1/vpcs?pageToken=p2",
    ]);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.cookie).toBe("vws_session=sess-1; vws_csrf=csrf-1");
    expect(headers.authorization).toBeUndefined();
    expect(headers["x-csrf-token"]).toBeUndefined();
    expect(headers.origin).toBeUndefined();
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
    expect(headers["x-csrf-token"]).toBe("csrf-1");
    expect(headers.origin).toBe("http://console.test");
    expect(headers.cookie).toBe("vws_session=sess-1; vws_csrf=csrf-1");
    expect(calls[0].init.body).toBe('{"cidrBlock":"10.9.0.0/16"}');
    expect(calls.slice(1).map((c) => c.url)).toEqual([
      "http://api.test/api/v1/operations/op-1",
      "http://api.test/api/v1/operations/op-1",
    ]);
  });

  it("returns the operation error when the operation fails", async () => {
    serve(
      respond(202, { operation: { id: "op-2", state: "running" } }),
      respond(200, { id: "op-2", state: "failed", error: { code: "Conflict", message: "cidr overlaps" } }),
    );
    expect(await createVpc("10.9.0.0/16")).toEqual({
      ok: false,
      error: { code: "Conflict", message: "cidr overlaps", requestId: null },
    });
  });

  it("returns the API error envelope for a rejected request", async () => {
    serve(
      respond(400, {
        error: { code: "InvalidArgument", field: "cidrBlock", message: "must be an ipv4 network" },
        requestId: "r-1",
      }),
    );
    expect(await createVpc("bad")).toEqual({
      ok: false,
      error: { code: "InvalidArgument", message: "must be an ipv4 network", requestId: "r-1" },
    });
  });

  it("reports missing configuration without calling the API", async () => {
    vi.stubEnv("VWS_CONSOLE_API_URL", "");
    serve();
    const result = await listVpcs();
    expect(result).toEqual({
      ok: false,
      error: {
        code: "ConsoleNotConfigured",
        message: "Set VWS_CONSOLE_API_URL on the console server.",
        requestId: null,
      },
    });
    expect(calls).toEqual([]);
  });

  it("redirects to the login screen without calling the API when there is no session", async () => {
    nav.session = null;
    serve();
    await expect(listVpcs()).rejects.toThrow("REDIRECT /login?next=%2Fnetwork%2Fvpcs");
    expect(calls).toEqual([]);
  });

  it("redirects to the login screen when console-api answers 401", async () => {
    serve(respond(401, { error: { code: "Unauthenticated", message: "authentication required" } }));
    await expect(listVpcs()).rejects.toThrow("REDIRECT /login?reason=expired&next=%2Fnetwork%2Fvpcs");
  });

  it("redirects a write that gets 401 too", async () => {
    nav.path = null;
    serve(respond(401, { error: { code: "Unauthenticated", message: "authentication required" } }));
    await expect(createVpc("10.9.0.0/16")).rejects.toThrow("REDIRECT /login?reason=expired");
  });

  it("signs in without a session and returns the cookies console-api set", async () => {
    nav.session = null;
    const reply = respond(200, {
      principal: "root",
      account: "123456789012",
      root: true,
      expiresAt: "x",
      csrfToken: "c",
    });
    reply.headers.append("set-cookie", "vws_session=s2; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict");
    reply.headers.append("set-cookie", "vws_csrf=c2; Path=/; Max-Age=43200; Secure; SameSite=Strict");
    serve(reply);
    expect(await login({ account: "123456789012", userName: "root", password: "pw" })).toEqual({
      ok: true,
      value: { session: "s2", csrf: "c2", maxAge: 43200 },
    });
    expect(calls[0].url).toBe("http://api.test/api/v1/auth/login");
    expect(calls[0].init.body).toBe('{"account":"123456789012","userName":"root","password":"pw"}');
    expect((calls[0].init.headers as Record<string, string>).cookie).toBeUndefined();
    expect((calls[0].init.headers as Record<string, string>).origin).toBe("http://console.test");
  });

  it("returns the uniform 401 from a failed sign-in instead of redirecting", async () => {
    serve(respond(401, { error: { code: "Unauthenticated", message: "authentication failed" } }));
    const result = await login({ account: "123456789012", userName: "root", password: "bad" });
    expect(result.ok).toBe(false);
  });

  it("signs out with the session cookie and CSRF token", async () => {
    serve(new Response(null, { status: 204 }));
    await logout();
    expect(calls[0].url).toBe("http://api.test/api/v1/auth/logout");
    expect(calls[0].init.headers).toEqual({
      "content-type": "application/json",
      cookie: "vws_session=sess-1; vws_csrf=csrf-1",
      "x-csrf-token": "csrf-1",
      origin: "http://console.test",
      "x-request-id": expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it("returns the new security group ID from the accepted request", async () => {
    serve(
      respond(202, {
        operation: { id: "op-4", state: "running" },
        items: [{ groupId: "sg-9", groupName: "web", vpcId: "vpc-1" }],
      }),
      respond(200, { id: "op-4", state: "succeeded" }),
    );
    expect(await createSecurityGroup("web", "vpc-1")).toEqual({ ok: true, value: "sg-9" });
    expect(calls[0].init.body).toBe('{"groupName":"web","vpcId":"vpc-1"}');
  });

  it("launches with tags only when there are some", async () => {
    serve(
      respond(202, { operation: { id: "op-3", state: "succeeded" } }),
      respond(202, { operation: { id: "op-4", state: "succeeded" } }),
    );
    const req = {
      imageId: "ami-1",
      instanceType: "vws.small",
      subnetId: "subnet-1",
      count: 2,
      keyPair: { kind: "none" as const },
    };
    await launchInstances({ ...req, tags: { Name: "web" } });
    await launchInstances({ ...req, tags: {} });
    expect(calls.map((c) => [c.url, c.init.body])).toEqual([
      [
        "http://api.test/api/v1/instances",
        '{"imageId":"ami-1","instanceType":"vws.small","subnetId":"subnet-1","count":2,"tags":{"Name":"web"}}',
      ],
      [
        "http://api.test/api/v1/instances",
        '{"imageId":"ami-1","instanceType":"vws.small","subnetId":"subnet-1","count":2}',
      ],
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
    serve(
      respond(202, { operation: { id: "op-c", state: "running" } }),
      respond(200, { id: "op-c", state: "failed", error: { code: "Conflict", message: "busy" } }),
    );
    expect(await instanceBatch("terminate", ids)).toEqual({
      ok: false,
      error: { code: "Conflict", message: "busy", requestId: null },
    });
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
    expect(calls.map((c) => c.url)).toEqual([
      "http://api.test/api/v1/vpcs/vpc-1",
      "http://api.test/api/v1/volumes/vol-x",
    ]);
  });

  it("sends the new size to the modify endpoint", async () => {
    serve(
      respond(202, { operation: { id: "op-5", state: "running" }, items: [] }),
      respond(200, { id: "op-5", state: "succeeded" }),
    );
    expect(await modifyVolume("vol-1", 9)).toEqual({ ok: true, value: undefined });
    expect(calls[0].url).toBe("http://api.test/api/v1/volumes/vol-1/modify");
    expect(calls[0].init.body).toBe('{"size":9}');
  });

  it("posts instance and device to the attach endpoint", async () => {
    serve(respond(202, { operation: { id: "op-attach", state: "succeeded" }, items: [] }));
    expect(await attachVolume("vol-1", { instanceId: "i-1", device: "/dev/sdf" })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(calls[0].url).toBe("http://api.test/api/v1/volumes/vol-1/attach");
    expect(calls[0].init.body).toBe('{"instanceId":"i-1","device":"/dev/sdf"}');
  });

  it("trims the instance id and device name before attaching", async () => {
    serve(respond(202, { operation: { id: "op-trim", state: "succeeded" }, items: [] }));
    expect(await attachVolume("vol-1", { instanceId: " i-1 ", device: " /dev/sdf " })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(calls[0].url).toBe("http://api.test/api/v1/volumes/vol-1/attach");
    expect(calls[0].init.body).toBe('{"instanceId":"i-1","device":"/dev/sdf"}');
  });

  it("rejects a blank instance id or device name without calling the API", async () => {
    const invalid = {
      ok: false,
      error: {
        code: "InvalidAttachment",
        message: "Choose an instance and a device name.",
        requestId: null,
      },
    };
    expect(await attachVolume("vol-1", { instanceId: "  ", device: "/dev/sdf" })).toEqual(invalid);
    expect(await attachVolume("vol-1", { instanceId: "i-1", device: "" })).toEqual(invalid);
    expect(calls).toEqual([]);
  });

  it("posts an empty body to the detach endpoint", async () => {
    serve(respond(202, { operation: { id: "op-detach", state: "succeeded" }, items: [] }));
    expect(await detachVolume("vol-1")).toEqual({ ok: true, value: undefined });
    expect(calls[0].url).toBe("http://api.test/api/v1/volumes/vol-1/detach");
    expect(calls[0].init.body).toBe("{}");
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

  it("reads the signed-in session for the account menu with the session cookie", async () => {
    serve(
      respond(200, {
        principal: "arn:vws:iam::123456789012:root",
        account: "123456789012",
        root: true,
        expiresAt: "t",
      }),
    );
    expect(await signedInSession()).toEqual({
      principal: "arn:vws:iam::123456789012:root",
      account: "123456789012",
      root: true,
      expiresAt: "t",
    });
    expect(calls[0].url).toBe("http://api.test/api/v1/auth/session");
    expect((calls[0].init.headers as Record<string, string>).cookie).toBe("vws_session=sess-1; vws_csrf=csrf-1");
  });

  it("gives no session for the menu instead of redirecting", async () => {
    serve(respond(401, { error: { code: "Unauthenticated", message: "authentication required" } }));
    expect(await signedInSession()).toBeNull();
    nav.session = null;
    expect(await signedInSession()).toBeNull();
    vi.stubEnv("VWS_CONSOLE_API_URL", "");
    nav.session = { session: "s", csrf: "c" };
    expect(await signedInSession()).toBeNull();
    expect(calls).toHaveLength(1);
  });

  describe("retries, timeouts and logs", () => {
    beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout"] }));
    afterEach(() => vi.useRealTimers());

    async function settle<T>(promise: Promise<T>): Promise<T> {
      await vi.runAllTimersAsync();
      return promise;
    }

    it("retries a GET after a 503 and a network error, then succeeds", async () => {
      let n = 0;
      vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        n++;
        if (n === 1) return respond(503, { error: { code: "ServiceUnavailable", message: "busy" } });
        if (n === 2) throw new TypeError("fetch failed");
        return respond(200, { items: [] });
      });
      expect(await settle(listVpcs())).toEqual({ ok: true, value: [] });
      expect(calls).toHaveLength(3);
      const ids = calls.map((c) => (c.init.headers as Record<string, string>)["x-request-id"]);
      expect(new Set(ids).size).toBe(1);
      expect(calls.every((c) => c.init.signal instanceof AbortSignal)).toBe(true);
    });

    it("stops retrying a GET after 3 attempts and reports the request ID", async () => {
      serve(
        respond(502, {}),
        respond(502, {}),
        respond(502, { error: { code: "BadGateway", message: "down" }, requestId: "r-9" }),
      );
      const result = await settle(listVpcs());
      expect(calls).toHaveLength(3);
      expect(result).toEqual({ ok: false, error: { code: "BadGateway", message: "down", requestId: "r-9" } });
    });

    it("does not retry a GET that the API rejected", async () => {
      serve(respond(400, { error: { code: "InvalidArgument", message: "bad" } }));
      await settle(listVpcs());
      expect(calls).toHaveLength(1);
    });

    it("never retries a write, even on a 503 or a network error", async () => {
      serve(respond(503, { error: { code: "ServiceUnavailable", message: "busy" } }));
      expect(await settle(createVpc("10.9.0.0/16"))).toMatchObject({
        ok: false,
        error: { code: "ServiceUnavailable" },
      });
      expect(calls).toHaveLength(1);
      calls = [];
      vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        throw new TypeError("fetch failed");
      });
      expect(await settle(createVpc("10.9.0.0/16"))).toMatchObject({
        ok: false,
        error: { code: "ServiceUnavailable" },
      });
      expect(calls).toHaveLength(1);
    });

    it("never retries sign-in or sign-out", async () => {
      serve(respond(503, { error: { code: "ServiceUnavailable", message: "busy" } }));
      await settle(login({ account: "1", userName: "root", password: "pw" }));
      expect(calls).toHaveLength(1);
      calls = [];
      serve(respond(503, {}));
      await settle(logout());
      expect(calls).toHaveLength(1);
    });

    it("times out a request that never answers and reports RequestTimeout", async () => {
      vi.stubEnv("VWS_CONSOLE_API_TIMEOUT_MS", "50");
      vi.useRealTimers();
      vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)));
      });
      const write = await createVpc("10.9.0.0/16");
      expect(write).toMatchObject({
        ok: false,
        error: { code: "RequestTimeout", requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) },
      });
      expect(calls).toHaveLength(1);
      calls = [];
      const signIn = await login({ account: "1", userName: "root", password: "pw" });
      expect(signIn).toMatchObject({ ok: false, error: { code: "RequestTimeout" } });
      expect(calls).toHaveLength(1);
    });

    it("logs sign-in, sign-out and session as structured lines without any secret", async () => {
      const lines: string[] = [];
      const capture = (line: unknown) => void lines.push(String(line));
      const info = vi.spyOn(console, "info").mockImplementation(capture);
      const warn = vi.spyOn(console, "warn").mockImplementation(capture);
      nav.session = { session: "SESSION-TOKEN-SECRET", csrf: "CSRF-VALUE-SECRET" };
      const ok = respond(200, {});
      ok.headers.append("set-cookie", "vws_session=NEW-SESSION-SECRET; HttpOnly");
      ok.headers.append("set-cookie", "vws_csrf=NEW-CSRF-SECRET");
      serve(
        respond(401, { error: { code: "Unauthenticated", message: "authentication failed" } }),
        ok,
        respond(200, { principal: "arn:vws:iam::1:root", account: "1" }),
        new Response(null, { status: 204 }),
      );
      await settle(
        login({ account: "123456789012", userName: "root", password: "PASSWORD-SECRET", mfaCode: "987654" }),
      );
      await settle(login({ account: "123456789012", userName: "root", password: "PASSWORD-SECRET" }));
      await settle(signedInSession());
      await settle(logout());
      info.mockRestore();
      warn.mockRestore();

      const events = lines.map((line) => JSON.parse(line));
      expect(events.map((e) => [e.event, e.outcome, e.status])).toEqual([
        ["auth.login", "failure", 401],
        ["auth.login", "success", 200],
        ["auth.session", "success", 200],
        ["auth.logout", "success", 204],
      ]);
      for (const e of events) {
        expect(Object.keys(e).sort()).toEqual(
          expect.arrayContaining(["durationMs", "event", "outcome", "requestId", "status"]),
        );
        expect(e.requestId).toMatch(/^[0-9a-f-]{36}$/);
        expect(typeof e.durationMs).toBe("number");
      }
      expect(events[0].code).toBe("Unauthenticated");
      const all = lines.join("\n");
      for (const secret of [
        "PASSWORD-SECRET",
        "987654",
        "SESSION-TOKEN-SECRET",
        "CSRF-VALUE-SECRET",
        "NEW-SESSION-SECRET",
        "NEW-CSRF-SECRET",
        "vws_session",
        "vws_csrf",
        "password",
        "mfa",
        "cookie",
      ]) {
        expect(all).not.toContain(secret);
      }
    });
  });

  describe("buckets", () => {
    const logs = { name: "logs-1", ownerId: "123", creationDate: "2026-08-02T00:00:00Z" };
    const accountLogs = { name: "logs-1", ownerId: "123", created: "2026-08-02T00:00:00Z" };
    const headers = (call: Call) => call.init.headers as Record<string, string>;

    it("follows bucket page tokens with pageSize and the session cookie", async () => {
      serve(
        respond(200, { items: [logs], nextPageToken: "p2" }),
        respond(200, { items: [{ ...logs, name: "logs-2" }] }),
      );
      const result = await listBuckets();
      expect(result.ok && result.value.map((bucket) => bucket.name)).toEqual(["logs-1", "logs-2"]);
      expect(calls.map((call) => [call.init.method, call.url])).toEqual([
        ["GET", "http://api.test/api/v1/buckets?pageSize=100"],
        ["GET", "http://api.test/api/v1/buckets?pageSize=100&pageToken=p2"],
      ]);
      const sent = headers(calls[0]);
      expect(sent.accept).toBe("application/json");
      expect(sent.cookie).toBe("vws_session=sess-1; vws_csrf=csrf-1");
      expect(sent["x-csrf-token"]).toBeUndefined();
      expect(sent.origin).toBeUndefined();
      expect(sent["content-type"]).toBeUndefined();
      expect(sent["idempotency-key"]).toBeUndefined();
      expect(sent.authorization).toBeUndefined();
    });

    it("returns no buckets when the page is empty", async () => {
      serve(respond(200, { items: [] }));
      expect(await listBuckets()).toEqual({ ok: true, value: [] });
      expect(calls.map((call) => call.url)).toEqual(["http://api.test/api/v1/buckets?pageSize=100"]);
    });

    it("returns MalformedResponse for a bad name and does not request the next page", async () => {
      serve(
        respond(200, {
          items: [{ name: "A", ownerId: "1", creationDate: "2026-08-02T00:00:00Z" }],
          nextPageToken: "p2",
        }),
        respond(200, { items: [{ ...logs, name: "logs-2" }] }),
      );
      expect(await listBuckets()).toMatchObject({ ok: false, error: { code: "MalformedResponse" } });
      expect(calls).toHaveLength(1);
    });

    it("puts a bucket with cookie write headers and no body", async () => {
      serve(respond(200, logs));
      expect(await putBucket(mustName("logs-1"))).toEqual({ ok: true, value: accountLogs });
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("http://api.test/api/v1/buckets/logs-1");
      expect(calls[0].init.method).toBe("PUT");
      expect(calls[0].init.body ?? null).toBeNull();
      const sent = headers(calls[0]);
      expect(sent.accept).toBe("application/json");
      expect(sent["content-type"]).toBe("application/json");
      expect(sent.cookie).toBe("vws_session=sess-1; vws_csrf=csrf-1");
      expect(sent["x-csrf-token"]).toBe("csrf-1");
      expect(sent.origin).toBe("http://console.test");
      expect(sent["idempotency-key"]).toBeUndefined();
      expect(sent.authorization).toBeUndefined();
    });

    it("treats a 200 for an existing name as that same bucket", async () => {
      serve(respond(200, logs));
      const result = await putBucket(mustName("logs-1"));
      expect(result).toEqual({ ok: true, value: accountLogs });
      expect(calls).toHaveLength(1);
    });

    it("returns BucketAlreadyExists from a 409 without a second request", async () => {
      serve(
        respond(409, {
          error: { code: "AlreadyExists", kind: "bucket", field: "name", message: "already exists" },
          requestId: "r-1",
        }),
      );
      expect(await putBucket(mustName("logs-1"))).toEqual({
        ok: false,
        error: {
          code: "BucketAlreadyExists",
          message: "The requested bucket name is not available. Select a different name and try again.",
          requestId: "r-1",
        },
      });
      expect(calls).toHaveLength(1);
    });

    it("rejects a 200 whose name is not the one requested", async () => {
      serve(respond(200, { ...logs, name: "other-1" }));
      expect(await putBucket(mustName("logs-1"))).toMatchObject({ ok: false, error: { code: "MalformedResponse" } });
      expect(calls).toHaveLength(1);
    });

    it("deletes a bucket with one 204 and the same cookie write headers", async () => {
      serve(new Response(null, { status: 204 }));
      expect(await deleteBucket(mustName("logs-1"))).toEqual({ ok: true, value: undefined });
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("http://api.test/api/v1/buckets/logs-1");
      expect(calls[0].init.method).toBe("DELETE");
      expect(calls[0].init.body ?? null).toBeNull();
      const sent = headers(calls[0]);
      expect(sent.accept).toBe("application/json");
      expect(sent["content-type"]).toBe("application/json");
      expect(sent.cookie).toBe("vws_session=sess-1; vws_csrf=csrf-1");
      expect(sent["x-csrf-token"]).toBe("csrf-1");
      expect(sent.origin).toBe("http://console.test");
      expect(sent["idempotency-key"]).toBeUndefined();
      expect(sent.authorization).toBeUndefined();
    });

    it("treats a 404 NotFound as a deleted bucket", async () => {
      serve(respond(404, { error: { code: "NotFound", message: "missing" } }));
      expect(await deleteBucket(mustName("logs-1"))).toEqual({ ok: true, value: undefined });
      expect(calls).toHaveLength(1);
    });

    it("keeps a 404 that is not NotFound as an error", async () => {
      serve(respond(404, { error: { code: "Forbidden", message: "no" }, requestId: "r-4" }));
      expect(await deleteBucket(mustName("logs-1"))).toEqual({
        ok: false,
        error: { code: "Forbidden", message: "no", requestId: "r-4" },
      });
    });

    it("returns BucketNotEmpty when the bucket is not empty", async () => {
      serve(
        respond(409, {
          error: { code: "Conflict", kind: "bucket", id: "logs-1", message: "bucket is not empty" },
          requestId: "r-9",
        }),
      );
      expect(await deleteBucket(mustName("logs-1"))).toEqual({
        ok: false,
        error: { code: "BucketNotEmpty", message: "The bucket you tried to delete is not empty.", requestId: "r-9" },
      });
    });

    it("returns BucketAlreadyOwnedByYou with console-api's text when the caller already owns the bucket", async () => {
      const message = "Your previous request to create the named bucket succeeded and you already own it.";
      serve(respond(409, { error: { code: "AlreadyExists", kind: "bucket", message }, requestId: "r-5" }));
      expect(await putBucket(mustName("logs-1"))).toEqual({
        ok: false,
        error: { code: "BucketAlreadyOwnedByYou", message, requestId: "r-5" },
      });
      expect(calls).toHaveLength(1);
    });

    it("returns OperationAborted, not BucketNotEmpty, for a create while the caller's bucket is still being deleted", async () => {
      const message = "A conflicting conditional action is currently in progress against this resource. Try again.";
      serve(respond(409, { error: { code: "Conflict", kind: "bucket", message }, requestId: "r-6" }));
      expect(await putBucket(mustName("logs-1"))).toEqual({
        ok: false,
        error: { code: "OperationAborted", message, requestId: "r-6" },
      });
      expect(calls).toHaveLength(1);
    });

    it("never answers BucketNotEmpty to a create, whatever the Conflict text", async () => {
      serve(respond(409, { error: { code: "Conflict", kind: "bucket", message: "busy" }, requestId: "r-7" }));
      expect(await putBucket(mustName("logs-1"))).toEqual({
        ok: false,
        error: { code: "OperationAborted", message: "busy", requestId: "r-7" },
      });
    });

    it("returns OperationAborted for a delete during the bucket's own deletion", async () => {
      const message = "A conflicting conditional action is currently in progress against this resource. Try again.";
      serve(respond(409, { error: { code: "Conflict", kind: "bucket", message }, requestId: "r-8" }));
      expect(await deleteBucket(mustName("logs-1"))).toEqual({
        ok: false,
        error: { code: "OperationAborted", message, requestId: "r-8" },
      });
    });

    it("maps IdempotencyMismatch to OperationAborted, as console-api's S3 table does", async () => {
      serve(
        respond(409, {
          error: { code: "IdempotencyMismatch", kind: "bucket", message: "token reused" },
          requestId: "r-2",
        }),
      );
      expect(await putBucket(mustName("logs-1"))).toEqual({
        ok: false,
        error: { code: "OperationAborted", message: "token reused", requestId: "r-2" },
      });
    });

    it("passes through codes S3 has no name for", async () => {
      serve(respond(403, { error: { code: "PermissionDenied", kind: "bucket", message: "denied" }, requestId: "r-3" }));
      expect(await putBucket(mustName("logs-1"))).toEqual({
        ok: false,
        error: { code: "PermissionDenied", message: "denied", requestId: "r-3" },
      });
    });

    it("rejects a PUT 204 and a DELETE 200 as MalformedResponse", async () => {
      serve(new Response(null, { status: 204 }));
      expect(await putBucket(mustName("logs-1"))).toMatchObject({ ok: false, error: { code: "MalformedResponse" } });
      serve(respond(200, logs));
      expect(await deleteBucket(mustName("logs-1"))).toMatchObject({ ok: false, error: { code: "MalformedResponse" } });
    });

    it("redirects a cookie-mode 401 on PUT to login", async () => {
      serve(respond(401, { error: { code: "Unauthenticated", message: "authentication required" } }));
      await expect(putBucket(mustName("logs-1"))).rejects.toThrow(
        "REDIRECT /login?reason=expired&next=%2Fnetwork%2Fvpcs",
      );
      expect(calls).toHaveLength(1);
    });

    it("does not poll an operation after a PUT 500", async () => {
      serve(respond(500, { error: { code: "InternalError", message: "nope" } }));
      expect(await putBucket(mustName("logs-1"))).toMatchObject({ ok: false, error: { code: "InternalError" } });
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("http://api.test/api/v1/buckets/logs-1");
    });

    it("reads one bucket and treats NotFound as missing", async () => {
      serve(respond(200, logs));
      expect(await getBucket(mustName("logs-1"))).toEqual({ ok: true, value: accountLogs });
      expect(calls[0].url).toBe("http://api.test/api/v1/buckets/logs-1");
      serve(respond(404, { error: { code: "NotFound", message: "missing" } }));
      expect(await getBucket(mustName("logs-1"))).toEqual({ ok: true, value: null });
    });

    it("keeps a bucket GET 404 that is not NotFound", async () => {
      serve(respond(404, { error: { code: "Forbidden", message: "no" }, requestId: "r-4" }));
      expect(await getBucket(mustName("gone-1"))).toEqual({
        ok: false,
        error: { code: "Forbidden", message: "no", requestId: "r-4" },
      });
    });

    it("rejects a bucket GET that is not 200", async () => {
      serve(new Response(null, { status: 204 }));
      expect(await getBucket(mustName("logs-1"))).toMatchObject({ ok: false, error: { code: "MalformedResponse" } });
    });

    const stored = {
      bucket: "logs-1",
      key: "a/b.txt",
      ownerId: "1",
      size: 5,
      etag: "e1",
      contentType: "text/plain",
      lastModified: "2026-08-02T00:00:00Z",
      body: "aGVsbG8=",
    };

    it("gets an object and decodes its base64 body", async () => {
      serve(respond(200, stored));
      expect(await getObject(mustName("logs-1"), "a/b.txt")).toEqual({
        ok: true,
        value: {
          bucket: "logs-1",
          key: "a/b.txt",
          size: 5,
          etag: "e1",
          contentType: "text/plain",
          lastModified: "2026-08-02T00:00:00Z",
          bytes: new Uint8Array([104, 101, 108, 108, 111]),
        },
      });
      expect(calls[0].url).toBe("http://api.test/api/v1/buckets/logs-1/objects/a/b.txt");
      expect(calls[0].init.method).toBe("GET");
      const sent = headers(calls[0]);
      expect(sent.cookie).toBe("vws_session=sess-1; vws_csrf=csrf-1");
      expect(sent["x-csrf-token"]).toBeUndefined();
    });

    it("encodes each key segment but keeps the slashes", async () => {
      serve(respond(200, { ...stored, key: "dir name/ü?.txt", size: 0, body: null }));
      expect(await getObject(mustName("logs-1"), "dir name/ü?.txt")).toMatchObject({ ok: true, value: { size: 0 } });
      expect(calls[0].url).toBe("http://api.test/api/v1/buckets/logs-1/objects/dir%20name/%C3%BC%3F.txt");
    });

    it("retries a GET object 503 and then succeeds", async () => {
      serve(respond(503, { error: { code: "Unavailable", message: "busy" } }), respond(200, stored));
      expect(await getObject(mustName("logs-1"), "a/b.txt")).toMatchObject({ ok: true });
      expect(calls).toHaveLength(2);
    });

    it("maps a missing key to NoSuchKey and a missing bucket to NoSuchBucket", async () => {
      serve(
        respond(404, {
          error: { code: "NotFound", kind: "object", id: "a/b.txt", message: "missing" },
          requestId: "r-5",
        }),
        respond(404, {
          error: { code: "NotFound", kind: "bucket", id: "logs-1", message: "missing" },
          requestId: "r-6",
        }),
      );
      expect(await getObject(mustName("logs-1"), "a/b.txt")).toEqual({
        ok: false,
        error: { code: "NoSuchKey", message: "The specified key does not exist.", requestId: "r-5" },
      });
      expect(await getObject(mustName("logs-1"), "a/b.txt")).toEqual({
        ok: false,
        error: { code: "NoSuchBucket", message: "The specified bucket does not exist.", requestId: "r-6" },
      });
    });

    it("rejects an object reply for another key, a bad body or a size that does not match", async () => {
      for (const body of [
        { ...stored, key: "other.txt" },
        { ...stored, bucket: "logs-2" },
        { ...stored, body: "not base64!" },
        { ...stored, size: 6 },
        { ...stored, size: -1 },
      ]) {
        serve(respond(200, body));
        expect(await getObject(mustName("logs-1"), "a/b.txt")).toMatchObject({
          ok: false,
          error: { code: "MalformedResponse" },
        });
      }
    });

    it("does not send a GET or DELETE for a key that walks out of the bucket", async () => {
      serve(respond(200, stored));
      for (const key of ["a/../victim.txt", "..", ""]) {
        expect(await getObject(mustName("logs-1"), key)).toMatchObject({
          ok: false,
          error: { code: "InvalidArgument" },
        });
        expect(await deleteObject(mustName("logs-1"), key)).toMatchObject({
          ok: false,
          error: { code: "InvalidArgument" },
        });
      }
      expect(calls).toEqual([]);
    });

    it("deletes an object with one 204 and the cookie write headers, never retried", async () => {
      serve(new Response(null, { status: 204 }));
      expect(await deleteObject(mustName("logs-1"), "a/b.txt")).toEqual({ ok: true, value: undefined });
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("http://api.test/api/v1/buckets/logs-1/objects/a/b.txt");
      expect(calls[0].init.method).toBe("DELETE");
      const sent = headers(calls[0]);
      expect(sent["x-csrf-token"]).toBe("csrf-1");
      expect(sent.origin).toBe("http://console.test");
      serve(respond(503, { error: { code: "Unavailable", message: "busy" } }));
      expect(await deleteObject(mustName("logs-1"), "a/b.txt")).toMatchObject({
        ok: false,
        error: { code: "Unavailable" },
      });
      expect(calls).toHaveLength(2);
    });

    it("treats a missing key as deleted, as S3 does, but not a missing bucket", async () => {
      serve(
        respond(404, { error: { code: "NotFound", kind: "object", message: "missing" } }),
        respond(404, { error: { code: "NotFound", kind: "bucket", message: "missing" }, requestId: "r-7" }),
      );
      expect(await deleteObject(mustName("logs-1"), "a/b.txt")).toEqual({ ok: true, value: undefined });
      expect(await deleteObject(mustName("gone-1"), "a/b.txt")).toEqual({
        ok: false,
        error: { code: "NoSuchBucket", message: "The specified bucket does not exist.", requestId: "r-7" },
      });
    });

    it("rejects a DELETE object 200 as MalformedResponse", async () => {
      serve(respond(200, {}));
      expect(await deleteObject(mustName("logs-1"), "a/b.txt")).toMatchObject({
        ok: false,
        error: { code: "MalformedResponse" },
      });
    });

    it("maps an upload over the size limit to EntityTooLarge", async () => {
      serve(respond(413, { error: { code: "PayloadTooLarge", kind: "object", message: "too big" }, requestId: "r-8" }));
      expect(await putObject(mustName("logs-1"), "a.bin", new Uint8Array([1]), "application/octet-stream")).toEqual({
        ok: false,
        error: {
          code: "EntityTooLarge",
          message: "Your proposed upload exceeds the maximum allowed object size.",
          requestId: "r-8",
        },
      });
    });

    it("keeps console-api's text for a download over the size limit, not the upload message", async () => {
      serve(
        respond(413, {
          error: { code: "PayloadTooLarge", kind: "object", message: "object is larger than 4 MiB" },
          requestId: "r-9",
        }),
      );
      expect(await getObject(mustName("logs-1"), "a.bin")).toEqual({
        ok: false,
        error: { code: "EntityTooLarge", message: "object is larger than 4 MiB", requestId: "r-9" },
      });
    });

    it("puts object bytes and uses json for a cookie write", async () => {
      const bytes = new Uint8Array([104, 101, 108, 108, 111]);
      serve(respond(200, { bucket: "logs-1", key: "a/b.txt", size: 5 }));
      expect(await putObject(mustName("logs-1"), "a/b.txt", bytes, "text/plain")).toEqual({
        ok: true,
        value: undefined,
      });
      expect(calls[0].url).toBe("http://api.test/api/v1/buckets/logs-1/objects/a/b.txt");
      expect(calls[0].init.method).toBe("PUT");
      expect(new Uint8Array(await (calls[0].init.body as Blob).arrayBuffer())).toEqual(bytes);
      const sent = headers(calls[0]);
      expect(sent["content-type"]).toBe("application/json");
      expect(sent["x-csrf-token"]).toBe("csrf-1");
      expect(sent["idempotency-key"]).toBeUndefined();
    });

    it("does not send an object key that walks out of the bucket", async () => {
      serve(respond(200, { key: "victim.txt" }));
      const bytes = new Uint8Array([1]);
      for (const key of ["a/../victim.txt", "../../new-bucket", ".", "..", "a/./b.txt"]) {
        expect(await putObject(mustName("logs-1"), key, bytes, "text/plain")).toMatchObject({
          ok: false,
          error: { code: "InvalidArgument" },
        });
      }
      expect(calls).toEqual([]);
    });

    it("sends a key whose name contains dots but is not a dot segment", async () => {
      serve(respond(200, { key: "a/foo..bar.txt" }));
      expect(await putObject(mustName("logs-1"), "a/foo..bar.txt", new Uint8Array([1]), "text/plain")).toEqual({
        ok: true,
        value: undefined,
      });
      expect(calls[0].url).toBe("http://api.test/api/v1/buckets/logs-1/objects/a/foo..bar.txt");
    });

    it("rejects an object response whose key does not match", async () => {
      serve(respond(200, { key: "other.txt" }));
      expect(await putObject(mustName("logs-1"), "notes.txt", new Uint8Array([1]), "text/plain")).toMatchObject({
        ok: false,
        error: { code: "MalformedResponse" },
      });
    });

    it("sends the file content type when the bearer token is used", async () => {
      vi.stubEnv("VWS_CONSOLE_IAM", "off");
      vi.stubEnv("VWS_CONSOLE_API_TOKEN", "tok");
      serve(respond(200, { key: "notes.txt" }));
      expect(await putObject(mustName("logs-1"), "notes.txt", new Uint8Array([1]), "text/plain")).toEqual({
        ok: true,
        value: undefined,
      });
      const sent = headers(calls[0]);
      expect(sent["content-type"]).toBe("text/plain");
      expect(sent.authorization).toBe("Bearer tok");
      expect(sent.cookie).toBeUndefined();
    });

    it("returns UnsupportedMediaType from a PUT 415", async () => {
      serve(
        respond(415, {
          error: { code: "UnsupportedMediaType", message: "application/json required" },
          requestId: "r-15",
        }),
      );
      expect(await putBucket(mustName("logs-1"))).toEqual({
        ok: false,
        error: { code: "UnsupportedMediaType", message: "application/json required", requestId: "r-15" },
      });
      expect(calls).toHaveLength(1);
    });
  });

  describe("IAM off (the default)", () => {
    beforeEach(() => {
      vi.stubEnv("VWS_CONSOLE_IAM", "off");
      vi.stubEnv("VWS_CONSOLE_API_TOKEN", "tok");
    });

    it("calls console-api with the server-side bearer token and no session, CSRF or Origin", async () => {
      nav.session = null;
      serve(respond(202, { operation: { id: "op-1", state: "succeeded" } }));
      expect(await createVpc("10.9.0.0/16")).toEqual({ ok: true, value: undefined });
      const headers = calls[0].init.headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer tok");
      expect(headers.cookie).toBeUndefined();
      expect(headers["x-csrf-token"]).toBeUndefined();
      expect(headers.origin).toBeUndefined();
      expect(headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("shows a 401 as an error instead of redirecting to login", async () => {
      serve(respond(401, { error: { code: "Unauthenticated", message: "bad token" } }));
      expect(await listVpcs()).toMatchObject({ ok: false, error: { code: "Unauthenticated" } });
    });

    it("reports a missing token without calling the API", async () => {
      vi.stubEnv("VWS_CONSOLE_API_TOKEN", "");
      serve();
      expect(await listVpcs()).toEqual({
        ok: false,
        error: {
          code: "ConsoleNotConfigured",
          message: "Set VWS_CONSOLE_API_TOKEN on the console server.",
          requestId: null,
        },
      });
      expect(calls).toEqual([]);
    });

    it("refuses sign-in and skips sign-out without calling the API", async () => {
      serve();
      expect(await login({ account: "1", userName: "root", password: "pw" })).toMatchObject({
        ok: false,
        error: { code: "SignInDisabled" },
      });
      await logout();
      expect(calls).toEqual([]);
    });

    it("reads the account for the menu with the bearer token", async () => {
      serve(
        respond(200, {
          principal: "arn:vws:iam::123456789012:root",
          account: "123456789012",
          root: true,
          loginEnabled: false,
        }),
      );
      expect(await signedInSession()).toMatchObject({ account: "123456789012" });
      expect(calls[0].init.headers).toMatchObject({ authorization: "Bearer tok" });
      expect((calls[0].init.headers as Record<string, string>).cookie).toBeUndefined();
    });

    it("puts a bucket with the bearer token and no cookie write headers", async () => {
      nav.session = null;
      serve(respond(200, { name: "logs-1", ownerId: "123", creationDate: "2026-08-02T00:00:00Z" }));
      expect(await putBucket(mustName("logs-1"))).toMatchObject({ ok: true, value: { name: "logs-1" } });
      const sent = calls[0].init.headers as Record<string, string>;
      expect(calls[0].init.method).toBe("PUT");
      expect(sent.authorization).toBe("Bearer tok");
      expect(sent["content-type"]).toBe("application/json");
      expect(sent.cookie).toBeUndefined();
      expect(sent["x-csrf-token"]).toBeUndefined();
      expect(sent.origin).toBeUndefined();
      expect(sent["idempotency-key"]).toBeUndefined();
      expect(calls).toHaveLength(1);
    });

    it("shows a PUT 401 as Unauthenticated instead of redirecting", async () => {
      serve(respond(401, { error: { code: "Unauthenticated", message: "bad token" } }));
      expect(await putBucket(mustName("logs-1"))).toMatchObject({ ok: false, error: { code: "Unauthenticated" } });
      expect(calls).toHaveLength(1);
    });
  });

  describe("IAM mode unknown", () => {
    it("refuses the call instead of using the token when detection fails and nothing is known", async () => {
      const { resetIamModeCache } = await import("./mode");
      resetIamModeCache();
      vi.stubEnv("VWS_CONSOLE_IAM", "");
      vi.stubEnv("VWS_CONSOLE_API_TOKEN", "tok");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        throw new TypeError("fetch failed");
      });
      expect(await createVpc("10.9.0.0/16")).toMatchObject({ ok: false, error: { code: "ServiceUnavailable" } });
      expect(calls.every((c) => c.url.endsWith("/api/v1/auth/session"))).toBe(true);
      expect(calls.some((c) => (c.init.headers as Record<string, string>).authorization)).toBe(false);
      warn.mockRestore();
      resetIamModeCache();
    });

    it("reports an invalid VWS_CONSOLE_IAM as ConsoleNotConfigured", async () => {
      vi.stubEnv("VWS_CONSOLE_IAM", "1");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      serve();
      expect(await listVpcs()).toMatchObject({ ok: false, error: { code: "ConsoleNotConfigured" } });
      expect(calls).toEqual([]);
      warn.mockRestore();
    });
  });

  describe("key pairs", () => {
    const rsaBody = '{"keyName":"web","keyType":"rsa","keyFormat":"pem"}';
    const edBody = '{"keyName":"web","keyType":"ed25519","keyFormat":"ppk"}';
    const importBody = '{"keyName":"laptop","publicKeyMaterial":"ssh-ed25519 AAAA"}';
    const material = "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----";
    const launchBase = { imageId: "ami-1", instanceType: "vws.small", subnetId: "subnet-1", count: 1 };

    function attempt(body: string, key = "attempt-web-1"): CreateAttempt {
      return { idempotencyKey: key as IdempotencyKey, body };
    }

    function pairItem(extra: Record<string, unknown> = {}) {
      return {
        keyPairId: "key-0123456789abcdef0",
        keyName: "web",
        keyFingerprint: "SHA256:abc",
        keyType: "ed25519",
        ownerId: "123456789012",
        keyMaterial: material,
        ...extra,
      };
    }

    function accepted(id: string, item: Record<string, unknown> = pairItem()) {
      return { operation: { id, state: "running" }, items: [item] };
    }

    async function settle<T>(promise: Promise<T>): Promise<T> {
      await vi.runAllTimersAsync();
      return promise;
    }

    it("follows the key pair page token", async () => {
      serve(
        respond(200, {
          items: [{ ...pairItem(), keyMaterial: "SECRET", keyName: "web", keyPairId: "key-01234567" }],
          nextPageToken: "p2",
        }),
        respond(200, {
          items: [{ ...pairItem(), keyName: "db", keyPairId: "key-89abcdef", keyMaterial: "SECRET" }],
        }),
      );
      const result = await listKeyPairs();
      expect(result.ok && result.value.map((item) => item.name)).toEqual(["web", "db"]);
      expect(result.ok && result.value.every((item) => !("keyMaterial" in item))).toBe(true);
      expect(calls.map((c) => c.url)).toEqual([
        "http://api.test/api/v1/key-pairs",
        "http://api.test/api/v1/key-pairs?pageToken=p2",
      ]);
    });

    it("posts the selected generate body with the attempt idempotency key", async () => {
      serve(
        respond(202, accepted("op-rsa", pairItem({ keyType: "rsa", keyMaterial: material }))),
        respond(200, { id: "op-rsa", state: "succeeded" }),
        respond(202, accepted("op-ed", pairItem())),
        respond(200, { id: "op-ed", state: "succeeded" }),
      );
      await createKeyPair(attempt(rsaBody));
      await createKeyPair(attempt(edBody, "attempt-web-2"));
      const posts = calls.filter((call) => call.url.endsWith("/key-pairs"));
      expect(posts.map((call) => call.init.body)).toEqual([rsaBody, edBody]);
      expect(posts.map((call) => (call.init.headers as Record<string, string>)["idempotency-key"])).toEqual([
        "attempt-web-1",
        "attempt-web-2",
      ]);
      expect(posts[0].init.headers).toEqual({
        accept: "application/json",
        "content-type": "application/json",
        cookie: "vws_session=sess-1; vws_csrf=csrf-1",
        "idempotency-key": "attempt-web-1",
        origin: "http://console.test",
        "x-csrf-token": "csrf-1",
        "x-request-id": expect.stringMatching(/^[0-9a-f-]{36}$/),
      });
    });

    it("posts an import body with the public key only", async () => {
      serve(
        respond(202, accepted("op-imp", pairItem({ keyName: "laptop", keyType: "ed25519", keyMaterial: "" }))),
        respond(200, { id: "op-imp", state: "succeeded" }),
      );
      const result = await createKeyPair(attempt(importBody, "attempt-laptop"));
      expect(calls[0].url).toBe("http://api.test/api/v1/key-pairs");
      expect(calls[0].init.body).toBe(importBody);
      expect((calls[0].init.headers as Record<string, string>)["idempotency-key"]).toBe("attempt-laptop");
      expect(result).toMatchObject({
        status: "ready",
        issued: { privateKey: null, settlement: "succeeded", keyPair: { name: "laptop" } },
      });
    });

    it("replays one attempt with the same key and body", async () => {
      serve(
        respond(202, accepted("op-1")),
        respond(200, { id: "op-1", state: "succeeded" }),
        respond(202, accepted("op-1")),
        respond(200, { id: "op-1", state: "succeeded" }),
      );
      const same = attempt(edBody, "attempt-replay");
      await createKeyPair(same);
      await createKeyPair(same);
      const posts = calls.filter((call) => call.url.endsWith("/key-pairs"));
      expect(posts).toHaveLength(2);
      expect(posts.map((call) => call.init.body)).toEqual([edBody, edBody]);
      expect(posts.map((call) => (call.init.headers as Record<string, string>)["idempotency-key"])).toEqual([
        "attempt-replay",
        "attempt-replay",
      ]);
    });

    it("reads keyMaterial from the 202 item, not from the operation poll", async () => {
      serve(
        respond(202, accepted("op-k")),
        respond(200, { id: "op-k", state: "running" }),
        respond(200, { id: "op-k", state: "succeeded" }),
      );
      const result = await createKeyPair(attempt(edBody));
      expect(result).toEqual({
        status: "ready",
        issued: {
          keyPair: {
            id: "key-0123456789abcdef0",
            name: "web",
            fingerprint: "SHA256:abc",
            type: "ed25519",
            ownerId: "123456789012",
          },
          privateKey: { fileName: "web.ppk", material, format: "ppk" },
          settlement: "succeeded",
        },
      });
      expect(calls[1].url).toBe("http://api.test/api/v1/operations/op-k");
      expect(calls[1].init.body).toBeUndefined();
    });

    it("returns the 202 material when the operation stays running through the budget", async () => {
      vi.useFakeTimers();
      vi.stubEnv("VWS_CONSOLE_API_TIMEOUT_MS", "600000");
      vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        if (calls.length === 1) return respond(202, accepted("op-slow"));
        return respond(200, { id: "op-slow", state: "running" });
      });
      try {
        const pending = createKeyPair(attempt(edBody));
        const result = await settle(pending);
        expect(result).toMatchObject({
          status: "ready",
          issued: { settlement: "still-running", privateKey: { material } },
        });
        expect(calls.length).toBeGreaterThan(2);
        expect(calls[1].url).toBe("http://api.test/api/v1/operations/op-slow");
      } finally {
        vi.useRealTimers();
      }
    });

    it("keeps the 202 material when the operation fails", async () => {
      serve(
        respond(202, accepted("op-fail")),
        respond(200, { id: "op-fail", state: "failed", error: { code: "InternalError", message: "disk" } }),
      );
      const result = await createKeyPair(attempt(rsaBody));
      expect(result).toMatchObject({
        status: "failed",
        error: { code: "InternalError", message: "disk", requestId: null },
        issued: { privateKey: { material, format: "pem", fileName: "web.pem" } },
      });
    });

    it("fails a generate response that has no private key material", async () => {
      serve(
        respond(202, accepted("op-empty", pairItem({ keyMaterial: "" }))),
        respond(200, { id: "op-empty", state: "succeeded" }),
      );
      const result = await createKeyPair(attempt(rsaBody));
      expect(result).toMatchObject({ status: "failed", issued: null, error: { code: "MalformedResponse" } });
    });

    it("fails an unreadable 202 even when the operation would succeed", async () => {
      serve(
        respond(202, { operation: { id: "op-bad", state: "running" } }),
        respond(200, { id: "op-bad", state: "succeeded" }),
      );
      const result = await createKeyPair(attempt(rsaBody));
      expect(result).toMatchObject({ status: "failed", issued: null, error: { code: "MalformedResponse" } });
    });

    it("keeps unexpected import material as a pem file", async () => {
      serve(
        respond(202, accepted("op-odd", pairItem({ keyName: "laptop", keyMaterial: "UNEXPECTED" }))),
        respond(200, { id: "op-odd", state: "succeeded" }),
      );
      const result = await createKeyPair(attempt(importBody));
      expect(result).toMatchObject({
        status: "ready",
        issued: { privateKey: { material: "UNEXPECTED", format: "pem", fileName: "laptop.pem" } },
      });
    });

    it("does not post a rejected name, an empty public key, or a bad idempotency key", async () => {
      serve(respond(202, accepted("op-no")));
      const emptyName = await createKeyPair(
        attempt('{"keyName":"","keyType":"rsa","keyFormat":"pem"}', "attempt-empty"),
      );
      const longName = await createKeyPair(
        attempt(JSON.stringify({ keyName: "a".repeat(256), keyType: "rsa", keyFormat: "pem" }), "attempt-long"),
      );
      const emptyKey = await createKeyPair(attempt('{"keyName":"laptop","publicKeyMaterial":""}', "attempt-pub"));
      const badKey = await createKeyPair({ idempotencyKey: "" as IdempotencyKey, body: rsaBody });
      expect(emptyName).toMatchObject({ status: "failed", issued: null });
      expect(longName).toMatchObject({ status: "failed", issued: null });
      expect(emptyKey).toMatchObject({ status: "failed", issued: null });
      expect(badKey).toMatchObject({ status: "failed", issued: null });
      expect(calls).toEqual([]);
    });

    it("returns AlreadyExists with the API code, message, and request id", async () => {
      serve(respond(409, { error: { code: "AlreadyExists", message: "key exists" }, requestId: "r-9" }));
      expect(await createKeyPair(attempt(rsaBody))).toEqual({
        status: "failed",
        error: { code: "AlreadyExists", message: "key exists", requestId: "r-9" },
        issued: null,
      });
      expect(calls[0].init.body).toBe(rsaBody);
    });

    it("deletes a key pair with an empty JSON body", async () => {
      serve(
        respond(202, { operation: { id: "op-d", state: "succeeded" } }),
        respond(202, { operation: { id: "op-e", state: "succeeded" } }),
      );
      expect(await deleteKeyPair("key-0123456789abcdef0" as KeyPairId)).toEqual({ ok: true, value: undefined });
      expect(await deleteKeyPair("key-01234567" as KeyPairId)).toEqual({ ok: true, value: undefined });
      expect(calls.map((call) => [call.url, call.init.body])).toEqual([
        ["http://api.test/api/v1/key-pairs/key-0123456789abcdef0/delete", "{}"],
        ["http://api.test/api/v1/key-pairs/key-01234567/delete", "{}"],
      ]);
    });

    it("does not fetch a delete id that is not key- plus 8 to 17 hex digits", async () => {
      serve(respond(202, { operation: { id: "op-x", state: "succeeded" } }));
      for (const id of ["admin", "key-zzzzzzzz", "key-0123456", "key-0123456789abcdef01"]) {
        const result = await deleteKeyPair(id as KeyPairId);
        expect(result).toEqual({
          ok: false,
          error: {
            code: "InvalidArgument",
            message: "Key pair id must be key- followed by 8 to 17 hex digits.",
            requestId: null,
          },
        });
      }
      expect(calls).toEqual([]);
    });

    it("launches with a key name and omits empty tags", async () => {
      serve(
        respond(202, { operation: { id: "op-l1", state: "succeeded" } }),
        respond(202, { operation: { id: "op-l2", state: "succeeded" } }),
        respond(404, { error: { code: "NotFound", message: "no such key" }, requestId: "r-2" }),
      );
      await launchInstances({ ...launchBase, tags: {}, keyPair: { kind: "pair", name: "web" as KeyPairName } });
      await launchInstances({
        ...launchBase,
        tags: { Name: "web" },
        keyPair: { kind: "pair", name: "web" as KeyPairName },
      });
      const missing = await launchInstances({
        ...launchBase,
        tags: {},
        keyPair: { kind: "pair", name: "missing" as KeyPairName },
      });
      expect(calls.map((call) => call.init.body)).toEqual([
        '{"imageId":"ami-1","instanceType":"vws.small","subnetId":"subnet-1","count":1,"keyName":"web"}',
        '{"imageId":"ami-1","instanceType":"vws.small","subnetId":"subnet-1","count":1,"keyName":"web","tags":{"Name":"web"}}',
        '{"imageId":"ami-1","instanceType":"vws.small","subnetId":"subnet-1","count":1,"keyName":"missing"}',
      ]);
      expect(missing).toEqual({
        ok: false,
        error: { code: "NotFound", message: "no such key", requestId: "r-2" },
      });
    });

    it("omits keyName when launch proceeds without a key pair", async () => {
      serve(respond(202, { operation: { id: "op-n", state: "succeeded" } }));
      await launchInstances({ ...launchBase, tags: {}, keyPair: { kind: "none" } });
      expect(calls[0].url).toBe("http://api.test/api/v1/instances");
      expect(calls[0].init.body).toBe('{"imageId":"ami-1","instanceType":"vws.small","subnetId":"subnet-1","count":1}');
    });

    it("does not launch while the key pair choice is unset or unacknowledged", async () => {
      serve(respond(202, { operation: { id: "op-no", state: "succeeded" } }));
      const undecided = [{ kind: "unset" }, { kind: "opt-out" }] as const;
      for (const keyPair of undecided) {
        await expect(
          launchInstances({
            ...launchBase,
            tags: {},
            keyPair: keyPair as unknown as { kind: "none" },
          }),
        ).rejects.toThrow("Select a key pair or proceed without one.");
      }
      expect(calls).toEqual([]);
    });
  });
});
