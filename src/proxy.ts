import { NextResponse, type NextRequest } from "next/server";
import { CSRF_COOKIE, SESSION_COOKIE } from "@/lib/vws-api/session-cookies";

const SESSION_CHECK_TIMEOUT_MS = 3_000;

/**
 * True only when console-api answers 401 for this session. Any other answer, a timeout or a network
 * error keeps the cookies, so a link to /login?reason=expired cannot sign a working session out.
 */
async function sessionRejected(base: string, session: string): Promise<boolean> {
  try {
    const response = await fetch(`${base.replace(/\/+$/, "")}/api/v1/auth/session`, {
      headers: { accept: "application/json", cookie: `${SESSION_COOKIE}=${session}` },
      cache: "no-store",
      signal: AbortSignal.timeout(SESSION_CHECK_TIMEOUT_MS),
    });
    return response.status === 401;
  } catch {
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
  const base = process.env.VWS_CONSOLE_API_URL;
  // Without console-api there is nothing to sign in to; the screens report ConsoleNotConfigured.
  if (!base) return NextResponse.next();
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
  // The setup installer, the e2e error routes and static assets need no session. /login is matched
  // only to delete an expired session's cookies.
  matcher: ["/((?!installer|e2e/|_next/|favicon\\.ico).*)"],
};
