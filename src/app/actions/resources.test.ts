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

import { createBucketAction, deleteBucketsAction, uploadObjectAction } from "./resources";

type Call = { url: string; init: RequestInit };

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const INVALID_NAME = {
  code: "InvalidArgument",
  message: "Use 3\u201363 characters: lowercase letters, numbers, and hyphens.",
  requestId: null,
};

const RESERVED_NAME = {
  code: "InvalidArgument",
  message: "Bucket names cannot start with xn--, sthree-, or amzn-s3-demo-, or end with -s3alias, --ol-s3, or --x-s3.",
  requestId: null,
};

const cleared = (deleted: string[]) => ({ deleted, error: null, failedName: null });

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

  it("rejects a reserved name without calling the API", async () => {
    serve();
    for (const name of ["xn--logs", "sthree-logs", "amzn-s3-demo-ab", "logs-s3alias", "ab--ol-s3", "ab--x-s3"]) {
      expect(await createBucketAction(name)).toEqual(RESERVED_NAME);
    }
    expect(calls).toEqual([]);
  });

  it("rejects a dotted name without calling the API", async () => {
    serve();
    expect(await createBucketAction("example.com")).toEqual(INVALID_NAME);
    expect(calls).toEqual([]);
  });

  it("deletes each name and treats NotFound as success", async () => {
    serve(new Response(null, { status: 204 }), respond(404, { error: { code: "NotFound", message: "missing" } }));
    expect(await deleteBucketsAction(["logs-1", "logs-2"])).toEqual(cleared(["logs-1", "logs-2"]));
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
      deleted: ["logs-1"],
      error: { code: "Conflict", message: "bucket is not empty", requestId: "r-9" },
      failedName: "logs-2",
    });
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.url)).toEqual([
      "http://api.test/api/v1/buckets/logs-1",
      "http://api.test/api/v1/buckets/logs-2",
    ]);
  });

  it("treats a missing bucket as deleted", async () => {
    serve(respond(404, { error: { code: "NotFound", message: "missing" } }));
    expect(await deleteBucketsAction(["logs-1"])).toEqual(cleared(["logs-1"]));
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe("DELETE");
    expect(calls[0].url).toBe("http://api.test/api/v1/buckets/logs-1");
  });

  it("stops on a bad name and does not send that name or later names", async () => {
    serve(new Response(null, { status: 204 }), new Response(null, { status: 204 }));
    expect(await deleteBucketsAction(["logs-1", "ab", "logs-2"])).toEqual({
      deleted: ["logs-1"],
      error: INVALID_NAME,
      failedName: "ab",
    });
    expect(calls.map((call) => call.url)).toEqual(["http://api.test/api/v1/buckets/logs-1"]);
  });

  it("deletes a reserved name the API already stored", async () => {
    serve(new Response(null, { status: 204 }));
    expect(await deleteBucketsAction(["xn--ab"])).toEqual(cleared(["xn--ab"]));
    expect(calls[0].url).toBe("http://api.test/api/v1/buckets/xn--ab");
  });

  it("uploads a file and refuses a key or a body the API will not store", async () => {
    serve(respond(200, { bucket: "logs-1", key: "notes.txt", size: 5 }));
    const form = new FormData();
    form.set("key", "notes.txt");
    form.set("file", new File(["hello"], "notes.txt", { type: "text/plain" }));
    expect(await uploadObjectAction("logs-1", form)).toBeNull();
    expect(calls[0].url).toBe("http://api.test/api/v1/buckets/logs-1/objects/notes.txt");
    expect(new TextDecoder().decode(await (calls[0].init.body as Blob).arrayBuffer())).toBe("hello");

    const slash = new FormData();
    slash.set("key", "/notes.txt");
    slash.set("file", new File(["x"], "notes.txt"));
    expect(await uploadObjectAction("logs-1", slash)).toMatchObject({ code: "InvalidArgument" });

    const huge = new FormData();
    huge.set("key", "big.bin");
    huge.set("file", new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.bin"));
    expect(await uploadObjectAction("logs-1", huge)).toMatchObject({
      code: "InvalidArgument",
      message: "Objects larger than 4 MiB cannot be uploaded.",
    });
    expect(calls).toHaveLength(1);
  });
});
