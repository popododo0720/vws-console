import { IamConfigError, forcedMode } from "@/lib/vws-api/mode";
import { ApiTransportError, apiFetch } from "@/lib/vws-api/transport";

/** A readiness probe must answer well inside the kubelet's default 1 s timeout budget plus slack. */
export const READY_TIMEOUT_MS = 2_000;

export type CheckName = "config" | "console-api";

/** Reasons are fixed strings: no URL, token, header or response body ever reaches the probe output. */
export type CheckResult =
  | { name: CheckName; status: "pass" }
  | { name: CheckName; status: "skip"; reason: string }
  | { name: CheckName; status: "fail"; reason: string };

export type Readiness = { ready: boolean; checks: CheckResult[] };

function parseApiBase(raw: string): URL | null {
  if (!URL.canParse(raw)) return null;
  const url = new URL(raw);
  return url.protocol === "http:" || url.protocol === "https:" ? url : null;
}

function configCheck(): CheckResult {
  if (forcedMode() instanceof IamConfigError) {
    return { name: "config", status: "fail", reason: 'VWS_CONSOLE_IAM must be "on", "off" or unset' };
  }
  const base = process.env.VWS_CONSOLE_API_URL;
  if (base && !parseApiBase(base)) {
    return { name: "config", status: "fail", reason: "VWS_CONSOLE_API_URL is not an http(s) URL" };
  }
  return { name: "config", status: "pass" };
}

/**
 * One unauthenticated GET /api/v1/auth/session, sent once with a bounded timeout. Any answer below 500
 * (401 included) proves console-api is up; 5xx, a timeout or a network error means it cannot serve.
 */
async function consoleApiCheck(base: string): Promise<CheckResult> {
  try {
    const reply = await apiFetch(
      `${base.replace(/\/+$/, "")}/api/v1/auth/session`,
      { headers: { accept: "application/json" } },
      { timeoutMs: READY_TIMEOUT_MS, retry: false },
    );
    if (reply.status >= 500) {
      return { name: "console-api", status: "fail", reason: `console-api answered ${reply.status}` };
    }
    return { name: "console-api", status: "pass" };
  } catch (error) {
    const timedOut = error instanceof ApiTransportError && error.kind === "timeout";
    return {
      name: "console-api",
      status: "fail",
      reason: timedOut
        ? `console-api did not answer within ${READY_TIMEOUT_MS} ms`
        : "console-api could not be reached",
    };
  }
}

/** Ready when the configuration is valid and, if console-api is configured, it answers. */
export async function checkReadiness(): Promise<Readiness> {
  const config = configCheck();
  const base = process.env.VWS_CONSOLE_API_URL;
  let api: CheckResult;
  if (config.status === "fail") {
    api = { name: "console-api", status: "skip", reason: "configuration is invalid" };
  } else if (!base) {
    api = { name: "console-api", status: "skip", reason: "VWS_CONSOLE_API_URL is not set (local data only)" };
  } else {
    api = await consoleApiCheck(base);
  }
  const checks = [config, api];
  return { ready: checks.every((check) => check.status !== "fail"), checks };
}
