// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "./proxy";

function req(path: string, cookies: Record<string, string> = {}, init: { method?: string; referer?: string } = {}) {
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  const headers: Record<string, string> = { host: "console.test" };
  if (cookie) headers.cookie = cookie;
  if (init.referer) headers.referer = init.referer;
  return new NextRequest(`http://console.test${path}`, { method: init.method, headers });
}

const FROM_SEOUL = "http://console.test/compute/instances?region=pve-seoul-1";

function deleted(response: Response) {
  return response.headers
    .getSetCookie()
    .filter((c) => /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c))
    .map((c) => c.split("=")[0]);
}

describe("proxy", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv("VWS_CONSOLE_API_URL", "http://api.test");
    vi.stubEnv("VWS_CONSOLE_IAM", "on");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("redirects a page without a session to login with the next path", async () => {
    const response = await proxy(req("/network/vpcs?x=1"));
    expect(response.headers.get("location")).toBe("http://console.test/login?next=%2Fnetwork%2Fvpcs%3Fx%3D1");
  });

  it("passes the page path on for a session", async () => {
    const response = await proxy(req("/network/vpcs", { vws_session: "s", vws_csrf: "c" }));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-vws-path")).toBe("/network/vpcs");
  });

  it("passes the page path on in every mode, over a path header the browser sent", async () => {
    for (const [iam, api] of [
      ["off", "http://api.test"],
      ["on", ""],
    ]) {
      vi.stubEnv("VWS_CONSOLE_IAM", iam);
      vi.stubEnv("VWS_CONSOLE_API_URL", api);
      const request = req("/storage/volumes?region=pve-seoul-1");
      request.headers.set("x-vws-path", "/forged?region=all");
      const response = await proxy(request);
      expect(response.headers.get("x-middleware-request-x-vws-path")).toBe("/storage/volumes?region=pve-seoul-1");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("keeps the region of the page the browser came from, before it asks for sign-in", async () => {
    const response = await proxy(req("/storage/volumes?tab=x", {}, { referer: FROM_SEOUL }));
    expect(response.headers.get("location")).toBe("http://console.test/storage/volumes?tab=x&region=pve-seoul-1");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("inherits no region for a write, a named region, another host, a malformed name or the login page", async () => {
    const session = { vws_session: "s", vws_csrf: "c" };
    const kept = [
      req("/storage/volumes", session, { referer: FROM_SEOUL, method: "POST" }),
      req("/storage/volumes?region=all", session, { referer: FROM_SEOUL }),
      req("/storage/volumes", session, { referer: "http://evil.test/?region=pve-seoul-1" }),
      req("/storage/volumes", session, { referer: "http://console.test/?region=PVE%0d%0aX-Evil:1" }),
      req("/storage/volumes", session, { referer: "not a url" }),
      req("/login", session, { referer: FROM_SEOUL }),
    ];
    for (const request of kept) expect((await proxy(request)).headers.get("location")).toBeNull();
  });

  it("deletes both cookies on /login?reason=expired when console-api rejects the session", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const response = await proxy(req("/login?reason=expired&next=%2F", { vws_session: "old", vws_csrf: "c" }));
    expect(deleted(response).sort()).toEqual(["vws_csrf", "vws_session"]);
    expect(fetchMock.mock.calls[0][0]).toBe("http://api.test/api/v1/auth/session");
    expect(fetchMock.mock.calls[0][1].headers.cookie).toBe("__Host-vws_session=old");
  });

  it("keeps a session console-api still accepts, or cannot confirm", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    expect(deleted(await proxy(req("/login?reason=expired", { vws_session: "ok", vws_csrf: "c" })))).toEqual([]);
    fetchMock.mockRejectedValueOnce(new Error("down"));
    expect(deleted(await proxy(req("/login?reason=expired", { vws_session: "ok", vws_csrf: "c" })))).toEqual([]);
  });

  it("does not call console-api for a plain visit to login", async () => {
    const response = await proxy(req("/login", { vws_session: "s", vws_csrf: "c" }));
    expect(deleted(response)).toEqual([]);
    expect(response.headers.get("location")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never redirects or refuses the probe endpoints", async () => {
    for (const path of ["/healthz", "/readyz"]) {
      expect((await proxy(req(path))).headers.get("location")).toBeNull();
    }
    vi.stubEnv("VWS_CONSOLE_IAM", "yes");
    expect((await proxy(req("/readyz"))).status).not.toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the probe endpoints and public images out of the matcher, but not metrics or lookalike pages", () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    for (const path of ["/healthz", "/readyz", "/images/vws-logo.svg"]) expect(matcher.test(path)).toBe(false);
    for (const path of ["/metrics", "/healthz/x", "/compute/instances"]) expect(matcher.test(path)).toBe(true);
  });

  it("answers 404 for /metrics on the app port in every sign-in mode, without calling console-api", async () => {
    for (const iam of ["on", "off", "", "yes"]) {
      vi.stubEnv("VWS_CONSOLE_IAM", iam);
      const response = await proxy(req("/metrics"));
      expect(response.status).toBe(404);
      expect(response.headers.get("location")).toBeNull();
      expect(await response.text()).toBe("");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for no sign-in when console-api is not configured", async () => {
    vi.stubEnv("VWS_CONSOLE_API_URL", "");
    expect((await proxy(req("/network/vpcs"))).headers.get("location")).toBeNull();
  });

  it("asks for no sign-in with IAM forced off", async () => {
    vi.stubEnv("VWS_CONSOLE_IAM", "off");
    const response = await proxy(req("/network/vpcs"));
    expect(response.headers.get("location")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("detects IAM off from console-api and asks for no sign-in", async () => {
    const { resetIamModeCache } = await import("@/lib/vws-api/mode");
    resetIamModeCache();
    vi.stubEnv("VWS_CONSOLE_IAM", "");
    fetchMock.mockResolvedValue(new Response('{"loginEnabled":false}', { status: 200 }));
    expect((await proxy(req("/network/vpcs"))).headers.get("location")).toBeNull();
    resetIamModeCache();
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    expect((await proxy(req("/network/vpcs"))).headers.get("location")).toContain("/login?next=");
    resetIamModeCache();
  });

  it("answers 503 and never passes the request through when the mode is unknown", async () => {
    const { resetIamModeCache } = await import("@/lib/vws-api/mode");
    resetIamModeCache();
    vi.stubEnv("VWS_CONSOLE_IAM", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const response = await proxy(req("/network/vpcs"));
    expect(response.status).toBe(503);
    expect(response.headers.get("x-middleware-next")).toBeNull();
    warn.mockRestore();
    resetIamModeCache();
  });

  it("answers 503 for an invalid VWS_CONSOLE_IAM", async () => {
    const { resetIamModeCache } = await import("@/lib/vws-api/mode");
    resetIamModeCache();
    vi.stubEnv("VWS_CONSOLE_IAM", "true");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await proxy(req("/network/vpcs"));
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("VWS_CONSOLE_IAM");
    warn.mockRestore();
    resetIamModeCache();
  });
});
