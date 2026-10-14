import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/vws-api/session-cookies";

/**
 * Sends a browser with no console session to the login screen. This is only the optimistic check:
 * every console-api call still forwards the session and turns a 401 into the same redirect.
 */
export function proxy(request: NextRequest) {
  // Without console-api there is nothing to sign in to; the screens report ConsoleNotConfigured.
  if (!process.env.VWS_CONSOLE_API_URL) return NextResponse.next();
  const path = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (!request.cookies.get(SESSION_COOKIE)?.value) {
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
  // The login screen, the setup installer, the e2e error routes and static assets need no session.
  matcher: ["/((?!login|installer|e2e/|_next/|favicon\\.ico).*)"],
};
