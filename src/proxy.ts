import { NextResponse, type NextRequest } from "next/server";
import { recordHttpRequest } from "@/lib/ops/metrics";
import { logAuth } from "@/lib/vws-api/log";
import { iamState } from "@/lib/vws-api/mode";
import { CSRF_COOKIE, SESSION_COOKIE } from "@/lib/vws-api/session-cookies";
import { apiFetch } from "@/lib/vws-api/transport";

const SESSION_CHECK_TIMEOUT_MS = 3_000;
/** Probe and scrape endpoints: never signed in, never refused with the console's 503 (see config). */
export const OPS_PATHS: ReadonlySet<string> = new Set(["/healthz", "/readyz", "/metrics"]);

/**
 * True only when console-api answers 401 for this session. Any other answer, a timeout or a network
 * error keeps the cookies, so a link to /login?reason=expired cannot sign a working session out.
 */
async function sessionRejected(base: string, session: string): Promise<boolean> {
  const started = performance.now();
  try {
    // One attempt only: this runs before /login renders, and an unconfirmed session is kept anyway.
    const reply = await apiFetch(
      `${base.replace(/\/+$/, "")}/api/v1/auth/session`,
      { headers: { accept: "application/json", cookie: `${SESSION_COOKIE}=${session}` } },
      { timeoutMs: SESSION_CHECK_TIMEOUT_MS, retry: false },
    );
    const rejected = reply.status === 401;
    logAuth({
      event: "auth.expired_cookie_cleared",
      outcome: rejected ? "success" : "skipped",
      status: reply.status,
      requestId: reply.requestId,
      durationMs: performance.now() - started,
    });
    return rejected;
  } catch {
    logAuth({
      event: "auth.expired_cookie_cleared",
      outcome: "error",
      status: null,
      requestId: null,
      durationMs: performance.now() - started,
    });
    return false;
  }
}

/**
 * Sends a browser with no console session to the login screen. This is only the optimistic check:
 * every console-api call still forwards the session and turns a 401 into the same redirect.
 *
 * Next cannot delete cookies while a page renders, so a 401 redirects to /login?reason=expired and
 * this proxy deletes the stale cookies there, after console-api confirms the session is rejected.
 */
export async function proxy(request: NextRequest) {
  // The matcher already skips these; this guard keeps a matcher edit from putting probes behind sign-in.
  if (OPS_PATHS.has(request.nextUrl.pathname)) return NextResponse.next();
  recordHttpRequest(request.method);
  const base = process.env.VWS_CONSOLE_API_URL;
  // IAM off (the default) uses the server-side token and asks for no sign-in; without console-api
  // there is nothing to sign in to either, and the screens report ConsoleNotConfigured.
  if (!base) return NextResponse.next();
  const state = await iamState();
  // Fail closed: if the mode is unknown (console-api unclear, no last-known mode) or VWS_CONSOLE_IAM is
  // invalid, refuse rather than let the page run with the root token.
  if (state === "unknown" || state === "invalid") {
    const message =
      state === "invalid"
        ? 'The console is misconfigured: VWS_CONSOLE_IAM must be "on", "off" or unset.'
        : "The console cannot reach console-api to learn whether sign-in is on. Try again shortly.";
    return new NextResponse(message, {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "5", "cache-control": "no-store" },
    });
  }
  if (state === "off") return NextResponse.next();
  const session = request.cookies.get(SESSION_COOKIE)?.value;

  if (request.nextUrl.pathname === "/login") {
    const response = NextResponse.next();
    if (session && request.nextUrl.searchParams.get("reason") === "expired" && (await sessionRejected(base, session))) {
      response.cookies.delete(SESSION_COOKIE);
      response.cookies.delete(CSRF_COOKIE);
    }
    return response;
  }

  const path = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = new URLSearchParams({ next: path }).toString();
    return NextResponse.redirect(url);
  }
  const headers = new Headers(request.headers);
  headers.set("x-vws-path", path);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // The setup installer, the e2e error routes, static assets and the probe/metrics endpoints need no
  // session. /login is matched only to delete an expired session's cookies.
  matcher: ["/((?!installer|e2e/|_next/|favicon\\.ico|(?:healthz|readyz|metrics)$).*)"],
};
