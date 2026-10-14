/** Cookie names console-api uses; the console server keeps them under the same names on its own origin. */
export const SESSION_COOKIE = "vws_session";
export const CSRF_COOKIE = "vws_csrf";

export type ApiSession = { session: string; csrf: string; maxAge: number | null };

/**
 * Reads vws_session and vws_csrf from the Set-Cookie headers of a login response.
 * Returns null unless both are present.
 */
export function sessionFromSetCookie(headers: string[]): ApiSession | null {
  const values = new Map<string, { value: string; maxAge: number | null }>();
  for (const header of headers) {
    const [pair, ...attrs] = header.split(";");
    const eq = pair.indexOf("=");
    if (eq < 1) continue;
    const name = pair.slice(0, eq).trim();
    const maxAgeAttr = attrs.map((attr) => attr.trim()).find((attr) => attr.toLowerCase().startsWith("max-age="));
    const maxAge = maxAgeAttr ? Number(maxAgeAttr.slice("max-age=".length)) : NaN;
    values.set(name, { value: pair.slice(eq + 1).trim(), maxAge: Number.isFinite(maxAge) ? maxAge : null });
  }
  const session = values.get(SESSION_COOKIE);
  const csrf = values.get(CSRF_COOKIE);
  if (!session?.value || !csrf?.value) return null;
  return { session: session.value, csrf: csrf.value, maxAge: session.maxAge };
}

/** Keeps a post-login redirect on this console: a single leading slash only. */
export function safeNext(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") && !value.startsWith("/login")
    ? value
    : "/";
}

/** Plain HTTP is only allowed for a loopback host (local development and e2e); anywhere else cookies are Secure. */
export function secureCookies(proto: string | null, host: string | null): boolean {
  const hostname = (host ?? "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  const loopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  return !(loopback && (proto ?? "http") === "http");
}
