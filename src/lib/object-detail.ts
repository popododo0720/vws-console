import { objectKeyProblem } from "@/lib/object-upload";
import { parseStoredBucketName, type ApiError, type BucketName, type StoredObject } from "@/lib/vws-api/adapter";

const FALLBACK_FILE_NAME = "download";

function bucketBase(bucket: BucketName): string {
  return `/storage/buckets/${encodeURIComponent(bucket)}`;
}

function keyQuery(key: string): string {
  return new URLSearchParams({ prefix: key }).toString();
}

/** The key rides in `?prefix=`, as in the AWS console: keys may hold `//`, `%` and 1024 characters that a path segment would not keep. */
export function objectPageHref(bucket: BucketName, key: string): string {
  return `${bucketBase(bucket)}/object?${keyQuery(key)}`;
}

export function objectDownloadHref(bucket: BucketName, key: string): string {
  return `${bucketBase(bucket)}/object/download?${keyQuery(key)}`;
}

export function objectArn(bucket: BucketName, key: string): string {
  return `arn:aws:s3:::${bucket}/${key}`;
}

export function s3Uri(bucket: BucketName, key: string): string {
  return `s3://${bucket}/${key}`;
}

/** The last non-empty segment of the key, so a save never carries a path. */
export function objectFileName(key: string): string {
  const last = key.split("/").filter((part) => part !== "" && part !== "." && part !== "..");
  return last.at(-1) ?? FALLBACK_FILE_NAME;
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

/** RFC 5987 value: every byte outside the attr-char set is percent-encoded. */
function encodeExtValue(text: string): string {
  return encodeURIComponent(text).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** `attachment` with an ASCII `filename` for old clients and the full name in `filename*`. Neither form can carry a quote, CR or LF. */
export function contentDisposition(key: string): string {
  const name = objectFileName(key).replace(LONE_SURROGATE, "\uFFFD").replace(CONTROL, "_");
  const ascii = name.replace(/[^\x20-\x7e]|["\\%]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeExtValue(name)}`;
}

/**
 * Headers for serving one stored object. The stored content type is never echoed: a console origin must not
 * render user bytes as HTML or script, so the body is always an opaque download.
 */
export function objectResponseHeaders(object: Pick<StoredObject, "key" | "size">): Record<string, string> {
  return {
    "content-type": "application/octet-stream",
    "content-length": String(object.size),
    "content-disposition": contentDisposition(object.key),
    "x-content-type-options": "nosniff",
    "cache-control": "private, no-store",
  };
}

export type ObjectTarget =
  { ok: true; bucket: BucketName; key: string } | { ok: false; reason: "bucket" | "key"; error: ApiError };

const invalid = (message: string): ApiError => ({ code: "InvalidArgument", message, requestId: null });

/**
 * Validates the route's bucket segment and `prefix` values before any API call. A missing or repeated
 * `prefix` is rejected rather than guessed at, so one URL names exactly one object.
 */
export function parseObjectTarget(rawBucket: string, prefixes: readonly string[]): ObjectTarget {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawBucket);
  } catch {
    decoded = "";
  }
  const bucket = parseStoredBucketName(decoded);
  if (!bucket) return { ok: false, reason: "bucket", error: invalid("The bucket name is not valid.") };
  if (prefixes.length !== 1) {
    return {
      ok: false,
      reason: "key",
      error: invalid("Exactly one prefix parameter naming the object key is required."),
    };
  }
  const problem = objectKeyProblem(prefixes[0]);
  if (problem) return { ok: false, reason: "key", error: invalid(problem) };
  return { ok: true, bucket, key: prefixes[0] };
}
