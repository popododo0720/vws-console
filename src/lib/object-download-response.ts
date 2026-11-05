import "server-only";
import { unstable_rethrow } from "next/navigation";
import { parseObjectTarget, objectResponseHeaders } from "@/lib/object-detail";
import type { ApiError, ApiResult, BucketName, ObjectContent } from "@/lib/vws-api/adapter";

export type ObjectReader = (bucket: BucketName, key: string) => Promise<ApiResult<ObjectContent>>;

const STATUS_BY_CODE: Record<string, number> = {
  InvalidArgument: 400,
  AccessDenied: 403,
  NoSuchKey: 404,
  NoSuchBucket: 404,
  RequestTimeout: 504,
};

const ERROR_HEADERS = {
  "content-type": "application/json",
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
};

function errorResponse(error: ApiError, status = STATUS_BY_CODE[error.code] ?? 502): Response {
  return new Response(
    JSON.stringify({ error: { code: error.code, message: error.message }, requestId: error.requestId }),
    {
      status,
      headers: ERROR_HEADERS,
    },
  );
}

/**
 * The whole body of the download route: the only place object bytes leave the console server. Failures are
 * JSON in the shape `parseApiError` reads, never HTML. A session redirect thrown by the reader is not caught.
 */
export async function objectDownloadResponse(
  params: { name: string },
  query: URLSearchParams,
  read: ObjectReader,
): Promise<Response> {
  const target = parseObjectTarget(params.name, query.getAll("prefix"));
  if (!target.ok) return errorResponse(target.error, 400);
  let result: ApiResult<ObjectContent>;
  try {
    result = await read(target.bucket, target.key);
  } catch (error) {
    unstable_rethrow(error);
    return errorResponse({ code: "InternalError", message: "The object could not be read.", requestId: null }, 502);
  }
  if (!result.ok) return errorResponse(result.error);
  const body = new Uint8Array(result.value.bytes);
  return new Response(body, {
    status: 200,
    headers: objectResponseHeaders({ key: result.value.key, size: body.byteLength }),
  });
}
