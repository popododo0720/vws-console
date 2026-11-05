import { describe, expect, it } from "vitest";
import { parseBucketName } from "@/lib/vws-api/adapter";
import {
  contentDisposition,
  objectArn,
  objectDownloadHref,
  objectFileName,
  objectPageHref,
  objectResponseHeaders,
  parseObjectTarget,
  s3Uri,
} from "@/lib/object-detail";

const bucket = parseBucketName("logs-1");
if (!bucket) throw new Error("logs-1");

const HOSTILE_KEYS = [
  'a/"quote".txt',
  "a/b\r\nSet-Cookie: x=1",
  "semi;colon=name.txt",
  "naïve/日本語.txt",
  "100%/done.txt",
  "it's (a) *file*.txt",
  "\\back\\slash",
];

describe("object hrefs", () => {
  it("round-trips any key through the prefix parameter", () => {
    for (const key of ["a b/c#d?e", "x//y", "日本語/ü.txt", "100%+plus", "a&prefix=other"]) {
      const href = objectPageHref(bucket, key);
      const url = new URL(href, "http://console.test");
      expect(url.pathname).toBe("/storage/buckets/logs-1/object");
      expect(url.searchParams.getAll("prefix")).toEqual([key]);
      expect(url.hash).toBe("");
    }
  });

  it("points the download at the route handler with the same key encoding", () => {
    const url = new URL(objectDownloadHref(bucket, "a b/c#d"), "http://console.test");
    expect(url.pathname).toBe("/storage/buckets/logs-1/object/download");
    expect(url.searchParams.getAll("prefix")).toEqual(["a b/c#d"]);
    expect(url.searchParams.has("disposition")).toBe(false);
  });

  it("builds the S3 URI and ARN with the literal key", () => {
    expect(s3Uri(bucket, "a b/c.txt")).toBe("s3://logs-1/a b/c.txt");
    expect(objectArn(bucket, "a b/c.txt")).toBe("arn:aws:s3:::logs-1/a b/c.txt");
  });
});

describe("objectFileName", () => {
  it("is the last segment", () => {
    expect(objectFileName("docs/2026/notes.txt")).toBe("notes.txt");
    expect(objectFileName("notes.txt")).toBe("notes.txt");
  });

  it("never yields a path or a dot segment", () => {
    expect(objectFileName("a/b/")).toBe("b");
    expect(objectFileName("a//")).toBe("a");
    expect(objectFileName("a/..")).toBe("a");
    expect(objectFileName("..")).toBe("download");
    expect(objectFileName("/")).toBe("download");
    expect(objectFileName(".")).toBe("download");
  });
});

describe("contentDisposition", () => {
  it("carries an ASCII fallback and the UTF-8 name", () => {
    expect(contentDisposition("docs/notes.txt")).toBe(`attachment; filename="notes.txt"; filename*=UTF-8''notes.txt`);
    const header = contentDisposition("日本語.txt");
    expect(header).toContain('filename="___.txt"');
    expect(header).toContain("filename*=UTF-8''%E6%97%A5%E6%9C%AC%E8%AA%9E.txt");
  });

  it("cannot be broken out of by a hostile key", () => {
    for (const key of HOSTILE_KEYS) {
      const header = contentDisposition(key);
      expect(header).not.toMatch(/[\r\n]/);
      expect(header).toMatch(/^attachment; filename="[^"\\%]*"; filename\*=UTF-8''[A-Za-z0-9%._~!$&+-]*$/);
    }
  });

  it("neutralises control characters and lone surrogates instead of throwing", () => {
    const header = contentDisposition("a/x\u0000\r\n\u0085y\ud800z");
    expect(header).not.toMatch(/[\u0000-\u001f]/);
    expect(header).toContain("%EF%BF%BD");
  });
});

describe("objectResponseHeaders", () => {
  it("always serves an opaque download, whatever content type was stored", () => {
    const headers = objectResponseHeaders({ key: "page.html", size: 12 });
    expect(headers).toEqual({
      "content-type": "application/octet-stream",
      "content-length": "12",
      "content-disposition": `attachment; filename="page.html"; filename*=UTF-8''page.html`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    });
  });
});

describe("parseObjectTarget", () => {
  it("accepts a bucket and exactly one valid prefix", () => {
    expect(parseObjectTarget("logs-1", ["docs/a b.txt"])).toEqual({ ok: true, bucket, key: "docs/a b.txt" });
  });

  it("rejects a bad bucket segment, including malformed percent-encoding", () => {
    for (const raw of ["", "UPPER", "a%2Fb", "%E0%A4%A", "..", "x".repeat(64)]) {
      const target = parseObjectTarget(raw, ["a"]);
      expect(target).toMatchObject({ ok: false, reason: "bucket", error: { code: "InvalidArgument" } });
    }
  });

  it("decodes the bucket segment once", () => {
    expect(parseObjectTarget("logs%2D1", ["a"])).toMatchObject({ ok: true, bucket });
  });

  it("rejects a missing, repeated or empty prefix before any API call", () => {
    for (const prefixes of [[], ["a", "b"], ["a", "a"], [""]]) {
      expect(parseObjectTarget("logs-1", prefixes)).toMatchObject({
        ok: false,
        reason: "key",
        error: { code: "InvalidArgument", requestId: null },
      });
    }
  });

  it("rejects keys the API would refuse", () => {
    for (const key of ["/abs", "a/../b", "a/./b", "a\u0000b", "a\nb", "k".repeat(1025)]) {
      expect(parseObjectTarget("logs-1", [key])).toMatchObject({ ok: false, reason: "key" });
    }
  });
});
