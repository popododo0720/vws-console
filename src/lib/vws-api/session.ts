import "server-only";
import { cookies, headers } from "next/headers";
import { CSRF_COOKIE, SESSION_COOKIE, secureCookies, type ApiSession } from "./session-cookies";

/** The signed-in console-api session, read from this console's own httpOnly cookies. */
export async function currentSession(): Promise<{ session: string; csrf: string } | null> {
  const jar = await cookies();
  const session = jar.get(SESSION_COOKIE)?.value;
  const csrf = jar.get(CSRF_COOKIE)?.value;
  return session && csrf ? { session, csrf } : null;
}

/**
 * Stores the console-api session on this console's origin. Both cookies are httpOnly: only the
 * console server forwards them, so browser JS never sees the session or the CSRF token.
 */
export async function storeSession(api: ApiSession) {
  const head = await headers();
  const secure = secureCookies(head.get("x-forwarded-proto"), head.get("host"));
  const options = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    ...(api.maxAge ? { maxAge: api.maxAge } : {}),
  };
  const jar = await cookies();
  jar.set(SESSION_COOKIE, api.session, options);
  jar.set(CSRF_COOKIE, api.csrf, options);
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(CSRF_COOKIE);
}
