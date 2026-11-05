import { randomUUID } from "node:crypto";
import { methodLabel, recordApiCall, recordApiRetry, recordApiTimeout } from "@/lib/ops/metrics";
import { traceHeaders, withSpan, type RetryReason } from "@/lib/ops/span";
import { safeCode } from "./log";
import type { IamState } from "./mode";
import type { ApiRoute } from "./route";

/** Per-attempt deadline for a console-api call, overridable with VWS_CONSOLE_API_TIMEOUT_MS. */
export const DEFAULT_TIMEOUT_MS = 10_000;
/** A GET is tried at most this many times; writes, sign-in and sign-out exactly once. */
export const GET_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 200;
const BACKOFF_MAX_MS = 2_000;
/** Answers worth another GET: throttling and gateway or server faults that are usually transient. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export type ApiReply = { status: number; headers: Headers; text: string; requestId: string; attempts: number };

export type ApiFetchOptions = {
  timeoutMs?: number;
  /** Set false to send a GET only once (for example on a latency-sensitive path). Non-GET is never retried. */
  retry?: boolean;
  /** The IAM mode the caller already resolved, for the span; mode.ts passes "unknown" while it detects. */
  iamMode?: IamState;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

export class ApiTransportError extends Error {
  constructor(
    readonly kind: "timeout" | "network",
    readonly requestId: string,
    readonly attempts: number,
  ) {
    super(kind === "timeout" ? "console-api did not answer in time" : "console-api could not be reached");
  }
}

export function timeoutMs(): number {
  const value = Number(process.env.VWS_CONSOLE_API_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

/** Full-jitter exponential backoff: up to 200 ms, 400 ms, … capped at 2 s. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  return Math.floor(random() * Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (attempt - 1)));
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The console-api error code from a failed answer's body when it looks like one, else the status. */
function errorType(status: number, text: string): string {
  try {
    return safeCode((JSON.parse(text) as { error?: { code?: unknown } } | null)?.error?.code) ?? String(status);
  } catch {
    return String(status);
  }
}

/**
 * One console-api call with a per-attempt timeout and an X-Request-Id console-api echoes in errors.
 * Only GET is retried, on a timeout, a network error or a retryable status, with bounded backoff.
 * POST (writes, sign-in, sign-out) is sent exactly once: a retry could repeat a change or count
 * against the sign-in lockout.
 *
 * The call is one CLIENT span `console-api <METHOD> <route template>`, with a `retry` event per repeated
 * attempt and W3C traceparent on every attempt. Status is ERROR for a timeout, a network error or a 5xx;
 * a 4xx keeps `error.type` but not ERROR, since a 401 on IAM mode detection is a normal answer.
 */
export async function apiFetch(
  base: string,
  route: ApiRoute,
  init: RequestInit,
  options: ApiFetchOptions = {},
): Promise<ApiReply> {
  const url = `${base.replace(/\/+$/, "")}/api/v1${route.path}`;
  const method = (init.method ?? "GET").toUpperCase();
  const label = methodLabel(method);
  const attempts = method === "GET" && options.retry !== false ? GET_ATTEMPTS : 1;
  const sleep = options.sleep ?? defaultSleep;
  const limit = options.timeoutMs ?? timeoutMs();
  const requestId = randomUUID();
  const started = performance.now();
  const seconds = () => (performance.now() - started) / 1000;
  const attributes = {
    "http.request.method": label,
    "url.template": route.template,
    "vws.request_id": requestId,
    "vws.iam_mode": options.iamMode ?? "unknown",
  } as const;
  return withSpan(`console-api ${label} ${route.template}`, "client", attributes, async (span) => {
    let failure: ApiTransportError | null = null;
    let reason: RetryReason = "network";
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (attempt > 1) {
        const wait = backoffMs(attempt - 1, options.random);
        span.retry({ attempt, reason, backoff_ms: wait });
        recordApiRetry(route.template, reason);
        await sleep(wait);
      }
      try {
        const response = await fetch(url, {
          ...init,
          headers: { ...(init.headers as Record<string, string>), "x-request-id": requestId, ...traceHeaders() },
          cache: "no-store",
          signal: AbortSignal.timeout(limit),
        });
        const text = await response.text();
        if (attempt < attempts && RETRYABLE_STATUS.has(response.status)) {
          reason = response.status === 429 ? "429" : "5xx";
          continue;
        }
        span.set({ "http.response.status_code": response.status, "vws.attempts": attempt });
        if (response.status >= 500) span.fail(errorType(response.status, text));
        else if (response.status >= 400) span.set({ "error.type": errorType(response.status, text) });
        recordApiCall({ method, route: route.template, status: response.status, kind: null, seconds: seconds() });
        return { status: response.status, headers: response.headers, text, requestId, attempts: attempt };
      } catch (error) {
        const name = (error as { name?: unknown } | null)?.name;
        const timedOut = name === "TimeoutError" || name === "AbortError";
        if (timedOut) recordApiTimeout(method, route.template);
        const kind = timedOut ? "timeout" : "network";
        reason = kind;
        failure = new ApiTransportError(kind, requestId, attempt);
      }
    }
    const error = failure ?? new ApiTransportError("network", requestId, attempts);
    span.set({ "vws.attempts": error.attempts });
    span.fail(error.kind);
    recordApiCall({ method, route: route.template, status: null, kind: error.kind, seconds: seconds() });
    throw error;
  });
}
