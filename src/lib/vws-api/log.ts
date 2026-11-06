import { recordAuthEvent, type AuthMetricEvent } from "@/lib/ops/metrics";
import { activeTraceIds } from "@/lib/ops/span";

/**
 * Structured server logs for the sign-in, sign-out and session paths. Only these fields are ever
 * written, so passwords, MFA codes, session tokens, cookies and CSRF values cannot reach the log.
 */
export type AuthEvent =
  | "auth.login"
  | "auth.logout"
  | "auth.session"
  | "auth.expired_cookie_cleared"
  | "iam.mode_detect"
  | "config.invalid"
  | "metrics.listen";

export type AuthLogFields = {
  event: AuthEvent;
  outcome: "success" | "failure" | "error" | "skipped" | "stale";
  status: number | null;
  requestId: string | null;
  durationMs: number;
  /** console-api's error code, such as Unauthenticated; never a message or a value from the request. */
  code?: string | null;
  attempts?: number;
};

/** A console-api error code (`Unauthenticated`, `LastKnown.on`): the only free-form string a log line or span carries. */
export function safeCode(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9.]{0,63}$/.test(value) ? value : null;
}

/** The four auth events that are also counted in auth_events_total; the diagnostics are logged only. */
const COUNTED: Partial<Record<AuthEvent, AuthMetricEvent>> = {
  "auth.login": "login",
  "auth.logout": "logout",
  "auth.session": "session",
  "auth.expired_cookie_cleared": "expired_cookie_cleared",
};

/**
 * Writes one allow-listed line. trace_id and span_id come from the active span, never from the caller,
 * and are left out outside a span. A counted event is also one auth_events_total increment.
 */
export function logAuth(fields: AuthLogFields): void {
  const line = {
    level: fields.outcome === "error" ? "warn" : "info",
    service: "vws-console",
    event: fields.event,
    outcome: fields.outcome,
    status: fields.status,
    requestId: fields.requestId,
    durationMs: Math.round(fields.durationMs),
    ...(safeCode(fields.code) ? { code: fields.code } : {}),
    ...(fields.attempts && fields.attempts > 1 ? { attempts: fields.attempts } : {}),
    ...activeTraceIds(),
  };
  const counted = COUNTED[fields.event];
  if (counted) recordAuthEvent(counted, fields.outcome);
  // eslint-disable-next-line no-console -- the single server sink for auth logs; stdout is collected as structured JSON
  (line.level === "warn" ? console.warn : console.info)(JSON.stringify(line));
}
