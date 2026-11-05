import { describe, expect, it, vi } from "vitest";
import {
  parseApiError,
  parseBucketName,
  type ApiResult,
  type BucketName,
  type ObjectContent,
} from "@/lib/vws-api/adapter";
import { objectDownloadResponse, type ObjectReader } from "@/lib/object-download-response";

const parsed = parseBucketName("logs-1");
if (!parsed) throw new Error("logs-1");
const bucket: BucketName = parsed;

function content(key: string, bytes: number[], contentType = "text/html"): ObjectContent {
  return {
    bucket,
    key,
    size: bytes.length,
    contentType,
    lastModified: "2026-08-02T00:00:00Z",
    etag: "e1",
    bytes: new Uint8Array(bytes),
  };
}

const query = (key: string) => new URLSearchParams({ prefix: key });

function reader(result: ApiResult<ObjectContent>): ReturnType<typeof vi.fn<ObjectReader>> {
  return vi.fn<ObjectReader>(async () => result);
}

describe("objectDownloadResponse", () => {
  it("serves the bytes as an opaque attachment", async () => {
    const read = reader({ ok: true, value: content("docs/page.html", [60, 98, 62]) });
    const response = await objectDownloadResponse({ name: "logs-1" }, query("docs/page.html"), read);
    expect(read).toHaveBeenCalledWith(bucket, "docs/page.html");
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([60, 98, 62]));
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-length")).toBe("3");
    expect(response.headers.get("content-disposition")).toContain('attachment; filename="page.html"');
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("serves an empty object", async () => {
    const read = reader({ ok: true, value: content("empty", []) });
    const response = await objectDownloadResponse({ name: "logs-1" }, query("empty"), read);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("0");
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  });

  it.each([
    ["NoSuchKey", 404],
    ["NoSuchBucket", 404],
    ["InvalidArgument", 400],
    ["AccessDenied", 403],
    ["RequestTimeout", 504],
    ["ServiceUnavailable", 502],
    ["SomethingNew", 502],
  ])("answers %s with %i and a JSON ApiError", async (code, status) => {
    const read = reader({ ok: false, error: { code, message: "nope", requestId: "r-1" } });
    const response = await objectDownloadResponse({ name: "logs-1" }, query("a"), read);
    expect(response.status).toBe(status);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(parseApiError(await response.json())).toEqual({ code, message: "nope", requestId: "r-1" });
  });

  it("rejects bad input with 400 before the reader is called", async () => {
    const read = reader({ ok: true, value: content("a", [1]) });
    const cases: [string, URLSearchParams][] = [
      ["logs-1", new URLSearchParams()],
      ["logs-1", new URLSearchParams("prefix=a&prefix=b")],
      ["logs-1", query("../etc/passwd")],
      ["logs-1", query("/abs")],
      ["Bad_Bucket", query("a")],
      ["%E0%A4%A", query("a")],
    ];
    for (const [name, params] of cases) {
      const response = await objectDownloadResponse({ name }, params, read);
      expect(response.status).toBe(400);
      expect(parseApiError(await response.json())?.code).toBe("InvalidArgument");
    }
    expect(read).not.toHaveBeenCalled();
  });

  it("ignores a disposition parameter and never serves inline", async () => {
    const read = reader({ ok: true, value: content("a.svg", [1], "image/svg+xml") });
    const params = new URLSearchParams({ prefix: "a.svg", disposition: "inline" });
    const response = await objectDownloadResponse({ name: "logs-1" }, params, read);
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
  });

  it("turns a throwing reader into a 502 JSON error", async () => {
    const read = vi.fn<ObjectReader>(async () => {
      throw new Error("socket hang up with a secret token");
    });
    const response = await objectDownloadResponse({ name: "logs-1" }, query("a"), read);
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain("secret");
    expect(parseApiError(JSON.parse(text))?.code).toBe("InternalError");
  });

  it("lets a session redirect through instead of answering it", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    const read = vi.fn<ObjectReader>(async () => {
      throw redirect;
    });
    await expect(objectDownloadResponse({ name: "logs-1" }, query("a"), read)).rejects.toBe(redirect);
  });

  it("keeps a hostile key out of the headers", async () => {
    const key = 'x/"\r\nSet-Cookie: a=b.txt';
    const read = reader({ ok: true, value: content(key, [1]) });
    const response = await objectDownloadResponse({ name: "logs-1" }, query(key), read);
    // objectKeyProblem refuses control characters, so this never reaches the reader
    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
