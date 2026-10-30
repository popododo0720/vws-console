import { randomUUID } from "node:crypto";
import { recordApiCall, statusOutcome } from "@/lib/ops/metrics";

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

/**
 * One console-api call with a per-attempt timeout and an X-Request-Id console-api echoes in errors.
 * Only GET is retried, on a timeout, a network error or a retryable status, with bounded backoff.
 * POST (writes, sign-in, sign-out) is sent exactly once: a retry could repeat a change or count
 * against the sign-in lockout.
 */
export async function apiFetch(url: string, init: RequestInit, options: ApiFetchOptions = {}): Promise<ApiReply> {
  const method = (init.method ?? "GET").toUpperCase();
  const attempts = method === "GET" && options.retry !== false ? GET_ATTEMPTS : 1;
  const sleep = options.sleep ?? defaultSleep;
  const limit = options.timeoutMs ?? timeoutMs();
  const requestId = randomUUID();
  const started = performance.now();
  const seconds = () => (performance.now() - started) / 1000;
  let failure: ApiTransportError | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1) await sleep(backoffMs(attempt - 1, options.random));
    try {
      const response = await fetch(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), "x-request-id": requestId },
        cache: "no-store",
        signal: AbortSignal.timeout(limit),
      });
      const text = await response.text();
      if (attempt < attempts && RETRYABLE_STATUS.has(response.status)) continue;
      recordApiCall({ method, outcome: statusOutcome(response.status), seconds: seconds() });
      return { status: response.status, headers: response.headers, text, requestId, attempts: attempt };
    } catch (error) {
      const name = (error as { name?: unknown } | null)?.name;
      const timedOut = name === "TimeoutError" || name === "AbortError";
      failure = new ApiTransportError(timedOut ? "timeout" : "network", requestId, attempt);
    }
  }
  const error = failure ?? new ApiTransportError("network", requestId, attempts);
  recordApiCall({ method, outcome: error.kind, seconds: seconds() });
  throw error;
}
