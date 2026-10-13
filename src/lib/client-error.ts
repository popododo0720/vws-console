type ClientError = {
  code: string;
  message: string;
  requestId: string | null;
};

const UNKNOWN_CODE = "InternalError";

function stringField(source: object, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = (source as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

export function normalizeClientError(error: unknown): ClientError {
  if (typeof error !== "object" || error === null) {
    return {
      code: UNKNOWN_CODE,
      message: typeof error === "string" ? error : "Unknown error",
      requestId: null,
    };
  }
  return {
    code: stringField(error, "code", "Code") ?? UNKNOWN_CODE,
    message: stringField(error, "message", "Message") ?? "Unknown error",
    requestId: stringField(error, "requestId", "RequestId"),
  };
}

export function reportClientError(error: unknown, context: string): ClientError {
  const normalized = normalizeClientError(error);
  // eslint-disable-next-line no-console -- the single client error sink
  console.error("[vws-console]", { context, ...normalized });
  return normalized;
}
