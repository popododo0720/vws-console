import { logAuth } from "./log";
import { apiFetch } from "./transport";

/**
 * The one place that decides whether the console signs users in (IAM on) or calls console-api with
 * the server-side VWS_CONSOLE_API_TOKEN bearer (IAM off).
 *
 * VWS_CONSOLE_IAM=on|off forces the mode; any other non-empty value is a configuration error.
 * Unset, the mode is detected from console-api's GET /api/v1/auth/session without credentials:
 * 200 {"loginEnabled":false} is IAM off (-iam static), 401 is IAM on (-iam fake/grpc), and a body with
 * loginEnabled:true (an authenticated session or the login response) is IAM on.
 *
 * Detection fails closed. If console-api does not answer clearly, the last mode it reported is used;
 * with none, the mode is "unknown" and callers must refuse the request (503) and never use the token.
 */
export type IamMode = "on" | "off";
export type IamState = IamMode | "unknown" | "invalid";

const CACHE_MS = 30_000;
const DETECT_TIMEOUT_MS = 3_000;
let fresh: { mode: IamMode; until: number } | null = null;
let lastKnown: IamMode | null = null;
let invalidLogged = false;

export class IamConfigError extends Error {
  readonly code = "ConsoleNotConfigured";
}

/** The forced mode, null when VWS_CONSOLE_IAM is unset, or an error for any other value. */
export function forcedMode(): IamMode | null | IamConfigError {
  const raw = process.env.VWS_CONSOLE_IAM;
  if (raw === undefined || raw.trim() === "") return null;
  const value = raw.trim().toLowerCase();
  if (value === "on" || value === "off") return value;
  return new IamConfigError('VWS_CONSOLE_IAM must be "on", "off" or unset (detect from console-api).');
}

/** Logs an invalid VWS_CONSOLE_IAM once per process; the value itself is not logged. */
export function reportInvalidConfig(): void {
  if (invalidLogged || !(forcedMode() instanceof IamConfigError)) return;
  invalidLogged = true;
  logAuth({
    event: "config.invalid",
    outcome: "error",
    status: null,
    requestId: null,
    durationMs: 0,
    code: "InvalidVwsConsoleIam",
  });
}

/** Maps a GET /auth/session answer to the mode, or null when it says nothing about it. */
export function modeFromSession(status: number, body: unknown): IamMode | null {
  if (status === 401) return "on";
  const flag = (body as { loginEnabled?: unknown } | null)?.loginEnabled;
  if (status >= 200 && status <= 299 && typeof flag === "boolean") return flag ? "on" : "off";
  return null;
}

function remember(mode: IamMode) {
  fresh = { mode, until: Date.now() + CACHE_MS };
  lastKnown = mode;
}

/** Records loginEnabled from any console-api body that carries it (the login response, a session). */
export function noteLoginEnabled(body: unknown): void {
  const mode = modeFromSession(200, body);
  if (mode) remember(mode);
}

export function resetIamModeCache(): void {
  fresh = null;
  lastKnown = null;
  invalidLogged = false;
}

export async function iamState(): Promise<IamState> {
  const forced = forcedMode();
  if (forced instanceof IamConfigError) {
    reportInvalidConfig();
    return "invalid";
  }
  if (forced) return forced;
  if (fresh && fresh.until > Date.now()) return fresh.mode;
  const base = process.env.VWS_CONSOLE_API_URL?.replace(/\/+$/, "");
  // No console-api: nothing to call with a token or a session; the screens report ConsoleNotConfigured.
  if (!base) return "off";
  const started = performance.now();
  let status: number | null = null;
  let requestId: string | null = null;
  try {
    const reply = await apiFetch(
      `${base}/api/v1/auth/session`,
      { headers: { accept: "application/json" } },
      { timeoutMs: DETECT_TIMEOUT_MS },
    );
    status = reply.status;
    requestId = reply.requestId;
    let body: unknown = null;
    try {
      body = reply.text ? JSON.parse(reply.text) : null;
    } catch {
      body = null;
    }
    const mode = modeFromSession(reply.status, body);
    if (mode) {
      remember(mode);
      return mode;
    }
  } catch {
    // Timeout or network error: handled below like an unclear answer.
  }
  const fallback = lastKnown ?? "unknown";
  logAuth({
    event: "iam.mode_detect",
    outcome: lastKnown ? "stale" : "error",
    status,
    requestId,
    code: lastKnown ? `LastKnown.${lastKnown}` : "IamModeUnknown",
    durationMs: performance.now() - started,
  });
  return fallback;
}

/**
 * The mode for callers that must not guess. Throws for "unknown" (console-api did not say, and there
 * is no last-known mode) and "invalid" (bad VWS_CONSOLE_IAM): the request is refused, never sent with
 * the root token.
 */
export class IamUnavailableError extends Error {
  constructor(readonly state: "unknown" | "invalid") {
    super(
      state === "invalid"
        ? 'VWS_CONSOLE_IAM must be "on", "off" or unset.'
        : "The console could not learn from console-api whether sign-in is on.",
    );
  }
}

export async function iamMode(): Promise<IamMode> {
  const state = await iamState();
  if (state === "unknown" || state === "invalid") throw new IamUnavailableError(state);
  return state;
}
