import { apiFetch } from "./transport";

/**
 * The one place that decides whether the console signs users in (IAM on) or calls console-api with
 * the server-side VWS_CONSOLE_API_TOKEN bearer (IAM off).
 *
 * VWS_CONSOLE_IAM=on|off forces the mode. Unset, it is detected from console-api's
 * GET /api/v1/auth/session without credentials (vws-console-api feat/console-login-enabled):
 * 200 {"loginEnabled":false} is IAM off (-iam static), 401 is IAM on (-iam fake/grpc), and a body
 * with loginEnabled:true (authenticated session or login response) is IAM on.
 */
export type IamMode = "on" | "off";

const CACHE_MS = 30_000;
const DETECT_TIMEOUT_MS = 3_000;
let cached: { mode: IamMode; until: number } | null = null;

function forced(): IamMode | null {
  const value = process.env.VWS_CONSOLE_IAM?.trim().toLowerCase();
  return value === "on" || value === "off" ? value : null;
}

/** Maps a GET /auth/session answer to the mode, or null when it says nothing about it. */
export function modeFromSession(status: number, body: unknown): IamMode | null {
  if (status === 401) return "on";
  const flag = (body as { loginEnabled?: unknown } | null)?.loginEnabled;
  if (status >= 200 && status <= 299 && typeof flag === "boolean") return flag ? "on" : "off";
  return null;
}

/** Records loginEnabled from any console-api body that carries it (the login response, a session). */
export function noteLoginEnabled(body: unknown): void {
  const mode = modeFromSession(200, body);
  if (mode) cached = { mode, until: Date.now() + CACHE_MS };
}

export function resetIamModeCache(): void {
  cached = null;
}

export async function iamMode(): Promise<IamMode> {
  const override = forced();
  if (override) return override;
  if (cached && cached.until > Date.now()) return cached.mode;
  const base = process.env.VWS_CONSOLE_API_URL?.replace(/\/+$/, "");
  if (!base) return "off";
  try {
    const reply = await apiFetch(`${base}/api/v1/auth/session`, { headers: { accept: "application/json" } }, { timeoutMs: DETECT_TIMEOUT_MS });
    let body: unknown = null;
    try {
      body = reply.text ? JSON.parse(reply.text) : null;
    } catch {
      body = null;
    }
    const mode = modeFromSession(reply.status, body);
    if (mode) {
      cached = { mode, until: Date.now() + CACHE_MS };
      return mode;
    }
  } catch {
    // Unreachable console-api: fall through without caching, so the next request detects again.
  }
  // An older console-api without loginEnabled, or no answer: keep the bearer path that works today.
  return "off";
}

export async function iamEnabled(): Promise<boolean> {
  return (await iamMode()) === "on";
}
