import { describe, expect, it } from "vitest";
import { safeNext, secureCookies, sessionFromSetCookie } from "./session-cookies";

describe("sessionFromSetCookie", () => {
  it("reads both cookies and the session max-age", () => {
    expect(
      sessionFromSetCookie(["vws_session=abc; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict", "vws_csrf=def; Path=/; Secure; SameSite=Strict"]),
    ).toEqual({ session: "abc", csrf: "def", maxAge: 43200 });
  });
  it("needs both cookies", () => {
    expect(sessionFromSetCookie(["vws_session=abc; HttpOnly"])).toBeNull();
    expect(sessionFromSetCookie(["vws_session=; Max-Age=0", "vws_csrf=; Max-Age=0"])).toBeNull();
    expect(sessionFromSetCookie([])).toBeNull();
  });
});

describe("safeNext", () => {
  it.each([
    ["/network/vpcs?x=1", "/network/vpcs?x=1"],
    ["//evil.test", "/"],
    ["/\\evil.test", "/"],
    ["https://evil.test", "/"],
    ["/login?next=/x", "/"],
    [undefined, "/"],
    [["/a"], "/"],
  ])("%s -> %s", (value, expected) => expect(safeNext(value)).toBe(expected));
});

describe("secureCookies", () => {
  it("only allows plain HTTP on loopback", () => {
    expect(secureCookies(null, "127.0.0.1:43125")).toBe(false);
    expect(secureCookies("http", "localhost")).toBe(false);
    expect(secureCookies("http", "[::1]:3000")).toBe(false);
    expect(secureCookies("https", "127.0.0.1")).toBe(true);
    expect(secureCookies("http", "console.example.com")).toBe(true);
    expect(secureCookies(null, null)).toBe(true);
  });
});
