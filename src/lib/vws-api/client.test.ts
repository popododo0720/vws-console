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

import {
  login,
  logout,
  signedInSession,
  createSubnet,
  createSubnetTags,
  createVpcTags,
  createInstanceTags,
  createSecurityGroup,
  createVpc,
  getVolume,
  getVpc,
  instanceBatch,
  launchInstances,
  listVpcs,
  modifyVolume,
} from "./client";

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
    const req = { imageId: "ami-1", instanceType: "vws.small", subnetId: "subnet-1", count: 2 };
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
});
