/**
 * Structured server logs for the sign-in, sign-out and session paths. Only these fields are ever
 * written, so passwords, MFA codes, session tokens, cookies and CSRF values cannot reach the log.
 */
export type AuthEvent = "auth.login" | "auth.logout" | "auth.session" | "auth.expired_cookie_cleared";

export type AuthLogFields = {
  event: AuthEvent;
  outcome: "success" | "failure" | "error" | "skipped";
  status: number | null;
  requestId: string | null;
  durationMs: number;
  /** console-api's error code, such as Unauthenticated; never a message or a value from the request. */
  code?: string | null;
  attempts?: number;
};

export function logAuth(fields: AuthLogFields): void {
  const line = {
    level: fields.outcome === "error" ? "warn" : "info",
    service: "vws-console",
    event: fields.event,
    outcome: fields.outcome,
    status: fields.status,
    requestId: fields.requestId,
    durationMs: Math.round(fields.durationMs),
    ...(fields.code && /^[A-Za-z][A-Za-z0-9.]{0,63}$/.test(fields.code) ? { code: fields.code } : {}),
    ...(fields.attempts && fields.attempts > 1 ? { attempts: fields.attempts } : {}),
  };
  // eslint-disable-next-line no-console -- the single server sink for auth logs; stdout is collected as structured JSON
  (line.level === "warn" ? console.warn : console.info)(JSON.stringify(line));
}
