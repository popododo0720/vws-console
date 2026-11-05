import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { download } from "@/lib/download";

const saved: { name: string; blob: Blob }[] = [];
let blobs: Blob[];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function opaqueRedirect(): Response {
  return { type: "opaqueredirect", ok: false, status: 0 } as unknown as Response;
}

describe("download", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    saved.length = 0;
    blobs = [];
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:x";
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ name: this.download, blob: blobs[blobs.length - 1] });
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("saves the bytes under the given file name and never follows a redirect", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([104, 105]), { status: 200 }));
    expect(await download("/storage/buckets/logs-1/object/download?prefix=a", "notes.txt")).toBeNull();
    const init = fetchMock.mock.calls[0][1];
    expect(init?.redirect).toBe("manual");
    expect(init?.credentials).toBe("same-origin");
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe("notes.txt");
    expect(new Uint8Array(await saved[0].blob.arrayBuffer())).toEqual(new Uint8Array([104, 105]));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });

  it("saves an empty object", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array(), { status: 200 }));
    expect(await download("/d", "empty")).toBeNull();
    expect(saved[0].blob.size).toBe(0);
  });

  it("sends the browser to sign in on a redirect and saves nothing", async () => {
    fetchMock.mockResolvedValue(opaqueRedirect());
    const navigate = vi.fn();
    window.history.replaceState(null, "", "/storage/buckets/logs-1/object?prefix=a%20b");
    expect(await download("/d", "x", navigate)).toBeNull();
    expect(navigate).toHaveBeenCalledTimes(1);
    const url = new URL(navigate.mock.calls[0][0], "http://console.test");
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("reason")).toBe("expired");
    expect(url.searchParams.get("next")).toBe("/storage/buckets/logs-1/object?prefix=a%20b");
    expect(saved).toEqual([]);
  });

  it("returns the ApiError the route sent and saves nothing", async () => {
    fetchMock.mockResolvedValue(
      json(404, { error: { code: "NoSuchKey", message: "The specified key does not exist." }, requestId: "r-1" }),
    );
    expect(await download("/d", "x")).toEqual({
      code: "NoSuchKey",
      message: "The specified key does not exist.",
      requestId: "r-1",
    });
    expect(saved).toEqual([]);
  });

  it("describes a non-JSON failure by its status", async () => {
    fetchMock.mockResolvedValue(new Response("<html>bad gateway</html>", { status: 502 }));
    expect(await download("/d", "x")).toEqual({
      code: "ServiceUnavailable",
      message: "The download failed with status 502.",
      requestId: null,
    });
    expect(saved).toEqual([]);
  });

  it("reports a network failure and a timeout as errors, never a rejection", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await download("/d", "x")).toMatchObject({ code: "ServiceUnavailable" });
    fetchMock.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    expect(await download("/d", "x")).toMatchObject({ code: "RequestTimeout" });
    expect(saved).toEqual([]);
  });

  it("reports a body that breaks off mid-transfer", async () => {
    const broken = new Response("x", { status: 200 });
    vi.spyOn(broken, "blob").mockRejectedValue(new TypeError("terminated"));
    fetchMock.mockResolvedValue(broken);
    expect(await download("/d", "x")).toMatchObject({
      code: "ServiceUnavailable",
      message: "The download was interrupted.",
    });
    expect(saved).toEqual([]);
  });
});
