import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { validateUpgrade } from "../../server/console-relay.mts";

function request(
  url = "/api/v1/instances/i-1234abcd/console?kind=vnc",
  cookie: string | undefined = "other=secret; vws_session=session-123; vws_csrf=csrf",
  origins = ["https://console.example"],
): Pick<IncomingMessage, "url" | "headers" | "rawHeaders"> {
  return {
    url,
    headers: {
      cookie,
      origin: origins[0],
      authorization: "Bearer do-not-forward",
      "sec-websocket-key": "key",
      "sec-websocket-version": "13",
      "sec-websocket-protocol": "binary",
      "sec-websocket-extensions": "permessage-deflate",
    },
    rawHeaders: origins.flatMap((origin) => ["Origin", origin]),
  };
}

describe("console upgrade boundary", () => {
  it("composes only the API session, Origin and websocket handshake headers", () => {
    expect(validateUpgrade(request())).toEqual({
      path: "/api/v1/instances/i-1234abcd/console?kind=vnc",
      headers: {
        connection: "Upgrade",
        upgrade: "websocket",
        cookie: "__Host-vws_session=session-123",
        origin: "https://console.example",
        "sec-websocket-key": "key",
        "sec-websocket-version": "13",
        "sec-websocket-protocol": "binary",
        "sec-websocket-extensions": "permessage-deflate",
      },
    });
  });
  it.each(["i-12345678", "i-1234567890abcdef", "i-1234567890abcdef0"])("accepts %s", (id) => {
    const result = validateUpgrade(request(`/api/v1/instances/${id}/console?kind=serial`));
    expect(result).toHaveProperty("path", `/api/v1/instances/${id}/console?kind=serial`);
  });
  it.each(["i-1234567", "i-1234567890abcdef012", "i-ABCDEF12", "..", "%69-12345678", "i-1234abcd%0a"])(
    "refuses malicious or boundary ID %s",
    (id) => {
      expect(validateUpgrade(request(`/api/v1/instances/${id}/console?kind=vnc`))).toEqual({ status: 400 });
    },
  );
  it.each(["", "kind=x", "kind=vnc&kind=vnc", "kind=vnc&extra=x", "kind=serial?", "kind=vnc&", "kind=%76nc"])(
    "refuses query %s",
    (query) => {
      expect(validateUpgrade(request(`/api/v1/instances/i-1234abcd/console?${query}`))).toEqual({ status: 400 });
    },
  );
  it("refuses other routes", () => {
    expect(validateUpgrade(request("/_next/webpack-hmr"))).toEqual({ status: 404 });
  });
  it.each(["", "other=value", "vws_session="])("requires a session", (cookie) => {
    expect(validateUpgrade(request(undefined, cookie))).toEqual({ status: 401 });
  });
  it.each(["vws_session=a; vws_session=b", 'vws_session="a,b"', "vws_session=a\r\nx=y"])(
    "refuses ambiguous or invalid cookies",
    (cookie) => {
      expect(validateUpgrade(request(undefined, cookie))).toEqual({ status: 400 });
    },
  );
  it("bounds the session size", () => {
    expect(validateUpgrade(request(undefined, `vws_session=${"a".repeat(4097)}`))).toEqual({ status: 431 });
  });
  it.each([
    { origins: [] },
    { origins: ["https://one.example", "https://two.example"] },
    { origins: ["https://one.example, https://two.example"] },
  ])("requires exactly one Origin", ({ origins }) => {
    expect(validateUpgrade(request(undefined, undefined, origins))).toEqual({ status: 400 });
  });
});
