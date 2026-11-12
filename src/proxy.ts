import { NextResponse, type NextRequest } from "next/server";
import { METRICS_PATH, recordHttpRequest } from "@/lib/ops/metrics";
import { withSpan } from "@/lib/ops/span";
import { logAuth } from "@/lib/vws-api/log";
import { iamState } from "@/lib/vws-api/mode";
import { API_SESSION_COOKIE, CSRF_COOKIE, SESSION_COOKIE } from "@/lib/vws-api/session-cookies";
import { route } from "@/lib/vws-api/route";
import { apiFetch } from "@/lib/vws-api/transport";

const SESSION_CHECK_TIMEOUT_MS = 3_000;
/** Probe endpoints: never signed in, never refused with the console's 503 (see config). */
export const OPS_PATHS: ReadonlySet<string> = new Set(["/healthz", "/readyz"]);

/**
 * True only when console-api answers 401 for this session. Any other answer, a timeout or a network
 * error keeps the cookies, so a link to /login?reason=expired cannot sign a working session out.
 */
async function sessionRejected(base: string, session: string): Promise<boolean> {
  return withSpan("vws.session_check", "internal", { "vws.iam_mode": "on" }, async (span) => {
    const started = performance.now();
    try {
      // One attempt only: this runs before /login renders, and an unconfirmed session is kept anyway.
      const reply = await apiFetch(
        base,
        route("/auth/session"),
        { headers: { accept: "application/json", cookie: `${API_SESSION_COOKIE}=${session}` } },
        { timeoutMs: SESSION_CHECK_TIMEOUT_MS, retry: false, iamMode: "on" },
      );
      const rejected = reply.status === 401;
      span.set({ "vws.outcome": rejected ? "rejected" : "kept" });
      logAuth({
        event: "auth.expired_cookie_cleared",
        outcome: rejected ? "success" : "skipped",
        status: reply.status,
        requestId: reply.requestId,
        durationMs: performance.now() - started,
      });
      return rejected;
    } catch {
      span.set({ "vws.outcome": "unconfirmed" });
      logAuth({
        event: "auth.expired_cookie_cleared",
        outcome: "error",
        status: null,
        requestId: null,
        durationMs: performance.now() - started,
      });
      return false;
    }
  });
}

/** The names console-api takes in X-Vws-Region; anything else in ?region= is not carried to the next page. */
const REGION_NAME = /^[a-z0-9-]{1,63}$/;

/**
 * The same URL with the region of the page the browser came from. Links and router calls name no region,
 * so without this a choice would last for one page.
 */
function withInheritedRegion(request: NextRequest): URL | null {
  if (request.method !== "GET" || request.nextUrl.searchParams.has("region")) return null;
  const referer = request.headers.get("referer");
  if (!referer || !URL.canParse(referer)) return null;
  const from = new URL(referer);
  const region = from.searchParams.get("region");
  // Not nextUrl.host: behind a reverse proxy that is the address Next listens on, not the one the browser used.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!region || !REGION_NAME.test(region) || from.host !== host) return null;
  const url = request.nextUrl.clone();
  url.searchParams.set("region", region);
  return url;
}

/**
 * Passes the request on with the page path, which the server reads for the sign-in return and the region.
 * no-store: Next answers an RSC request that lacks its _rsc with a redirect that has no cache headers, and a
 * browser replays that on Back for the page itself, leaving _rsc in the address bar.
 */
function forward(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-vws-path", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("cache-control", "no-store");
  return response;
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
  // Metrics are served only on METRICS_PORT. A scraper pointed at the app port gets 404, not the login page.
  if (request.nextUrl.pathname === METRICS_PATH) {
    return new NextResponse(null, { status: 404, headers: { "cache-control": "no-store" } });
  }
  recordHttpRequest(request.method);
  const inherited = request.nextUrl.pathname === "/login" ? null : withInheritedRegion(request);
  if (inherited) return NextResponse.redirect(inherited, { headers: { "cache-control": "no-store" } });
  const base = process.env.VWS_CONSOLE_API_URL;
  // IAM off (the default) uses the server-side token and asks for no sign-in; without console-api
  // there is nothing to sign in to either, and the screens report ConsoleNotConfigured.
  if (!base) return forward(request);
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
  if (state === "off") return forward(request);
  const session = request.cookies.get(SESSION_COOKIE)?.value;

  if (request.nextUrl.pathname === "/login") {
    const response = NextResponse.next();
    if (session && request.nextUrl.searchParams.get("reason") === "expired" && (await sessionRejected(base, session))) {
      response.cookies.delete(SESSION_COOKIE);
      response.cookies.delete(CSRF_COOKIE);
    }
    return response;
  }

  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = new URLSearchParams({ next: `${request.nextUrl.pathname}${request.nextUrl.search}` }).toString();
    return NextResponse.redirect(url);
  }
  return forward(request);
}

export const config = {
  // The e2e error routes, static assets and the probe endpoints need no session.
  // /login is matched only to delete an expired session's cookies.
  matcher: ["/((?!e2e/|_next/|images/|favicon\\.ico|(?:healthz|readyz)$).*)"],
};
