// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { iamMode, modeFromSession, noteLoginEnabled, resetIamModeCache } from "./mode";

describe("modeFromSession", () => {
  it("maps console-api answers to the mode", () => {
    expect(modeFromSession(200, { loginEnabled: false })).toBe("off");
    expect(modeFromSession(401, null)).toBe("on");
    expect(modeFromSession(200, { principal: "x", loginEnabled: true })).toBe("on");
    expect(modeFromSession(200, {})).toBeNull();
    expect(modeFromSession(503, { loginEnabled: false })).toBeNull();
  });
});

describe("iamMode", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    resetIamModeCache();
    vi.stubEnv("VWS_CONSOLE_API_URL", "http://api.test/");
    vi.stubEnv("VWS_CONSOLE_IAM", "");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetIamModeCache();
  });

  it("detects IAM off from an unauthenticated 200 loginEnabled:false, without credentials, and caches it", async () => {
    fetchMock.mockResolvedValue(new Response('{"loginEnabled":false}', { status: 200 }));
    expect(await iamMode()).toBe("off");
    expect(await iamMode()).toBe("off");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://api.test/api/v1/auth/session");
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
    expect(headers.cookie).toBeUndefined();
  });

  it("detects IAM on from a 401", async () => {
    fetchMock.mockResolvedValue(new Response('{"error":{"code":"Unauthenticated"}}', { status: 401 }));
    expect(await iamMode()).toBe("on");
  });

  it("takes loginEnabled:true from a login or session body", async () => {
    noteLoginEnabled({ principal: "x", loginEnabled: true });
    expect(await iamMode()).toBe("on");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets VWS_CONSOLE_IAM force the mode without asking console-api", async () => {
    vi.stubEnv("VWS_CONSOLE_IAM", "on");
    expect(await iamMode()).toBe("on");
    vi.stubEnv("VWS_CONSOLE_IAM", "OFF");
    expect(await iamMode()).toBe("off");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to off, uncached, when console-api is unreachable or says nothing", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await iamMode()).toBe("off");
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await iamMode()).toBe("off");
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    expect(await iamMode()).toBe("on");
  });

  it("is off with no console-api URL", async () => {
    vi.stubEnv("VWS_CONSOLE_API_URL", "");
    expect(await iamMode()).toBe("off");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
