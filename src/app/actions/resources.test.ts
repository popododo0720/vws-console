import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  session: { session: "sess-1", csrf: "csrf-1" } as { session: string; csrf: string } | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-vws-path": "/storage/buckets", origin: "http://console.test" }),
}));
vi.mock("@/lib/vws-api/session", () => ({ currentSession: async () => nav.session }));

import { createBucketAction, deleteBucketsAction } from "./resources";

type Call = { url: string; init: RequestInit };

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const INVALID_NAME = {
  code: "InvalidArgument",
  message: "Use 3\u201363 characters: lowercase letters, numbers, and hyphens.",
  requestId: null,
};

describe("bucket actions", () => {
  let calls: Call[];

  beforeEach(() => {
    calls = [];
    vi.stubEnv("VWS_CONSOLE_API_URL", "http://api.test/");
    vi.stubEnv("VWS_CONSOLE_IAM", "on");
    nav.session = { session: "sess-1", csrf: "csrf-1" };
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

  it("creates a trimmed name with one PUT and returns null", async () => {
    serve(respond(200, { name: "logs-1", ownerId: "123", creationDate: "2026-08-02T00:00:00Z" }));
    expect(await createBucketAction(" logs-1 ")).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe("PUT");
    expect(calls[0].url).toBe("http://api.test/api/v1/buckets/logs-1");
  });

  it("rejects a short name without calling the API", async () => {
    serve();
    expect(await createBucketAction("ab")).toEqual(INVALID_NAME);
    expect(calls).toEqual([]);
  });

  it("deletes each name and treats NotFound as success", async () => {
    serve(new Response(null, { status: 204 }), respond(404, { error: { code: "NotFound", message: "missing" } }));
    expect(await deleteBucketsAction(["logs-1", "logs-2"])).toBeNull();
    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ["DELETE", "http://api.test/api/v1/buckets/logs-1"],
      ["DELETE", "http://api.test/api/v1/buckets/logs-2"],
    ]);
  });

  it("stops after a conflict and does not delete later names", async () => {
    serve(
      new Response(null, { status: 204 }),
      respond(409, { error: { code: "Conflict", message: "bucket is not empty" }, requestId: "r-9" }),
      new Response(null, { status: 204 }),
    );
    expect(await deleteBucketsAction(["logs-1", "logs-2", "logs-3"])).toEqual({
      code: "Conflict",
      message: "bucket is not empty",
      requestId: "r-9",
    });
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.url)).toEqual([
      "http://api.test/api/v1/buckets/logs-1",
      "http://api.test/api/v1/buckets/logs-2",
    ]);
  });

  it("returns null when the only bucket is already gone", async () => {
    serve(respond(404, { error: { code: "NotFound", message: "missing" } }));
    expect(await deleteBucketsAction(["logs-1"])).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe("DELETE");
    expect(calls[0].url).toBe("http://api.test/api/v1/buckets/logs-1");
  });

  it("stops on a bad name and does not send that name or later names", async () => {
    serve(new Response(null, { status: 204 }), new Response(null, { status: 204 }));
    expect(await deleteBucketsAction(["logs-1", "ab", "logs-2"])).toEqual(INVALID_NAME);
    expect(calls.map((call) => call.url)).toEqual(["http://api.test/api/v1/buckets/logs-1"]);
  });
});
