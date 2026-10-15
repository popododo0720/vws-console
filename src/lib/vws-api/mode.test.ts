// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { iamMode, iamState, IamUnavailableError, modeFromSession, noteLoginEnabled, resetIamModeCache } from "./mode";

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

  it("fails closed with no last-known mode: a timeout, network error or unclear answer is unknown, never off", async () => {
    const lines: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation((line: unknown) => void lines.push(String(line)));
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await iamState()).toBe("unknown");
    await expect(iamMode()).rejects.toBeInstanceOf(IamUnavailableError);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await iamState()).toBe("unknown");
    fetchMock.mockResolvedValue(new Response("", { status: 503 }));
    expect(await iamState()).toBe("unknown");
    warn.mockRestore();
    expect(JSON.parse(lines[0])).toMatchObject({ event: "iam.mode_detect", outcome: "error", code: "IamModeUnknown" });
  });

  it("keeps the last-known mode when a later detection fails", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    expect(await iamState()).toBe("on");
    vi.setSystemTime(Date.now() + 31_000);
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await iamState()).toBe("on");
    warn.mockRestore();
    info.mockRestore();
    vi.useRealTimers();
  });

  it("treats an invalid VWS_CONSOLE_IAM as a config error, logs it once without the value, and never detects", async () => {
    const lines: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation((line: unknown) => void lines.push(String(line)));
    for (const value of ["true", "1", "yes", "enabled"]) {
      vi.stubEnv("VWS_CONSOLE_IAM", value);
      expect(await iamState()).toBe("invalid");
      await expect(iamMode()).rejects.toMatchObject({ state: "invalid" });
    }
    warn.mockRestore();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      event: "config.invalid",
      outcome: "error",
      code: "InvalidVwsConsoleIam",
    });
    expect(lines[0]).not.toContain("enabled");
  });

  it("is off with no console-api URL", async () => {
    vi.stubEnv("VWS_CONSOLE_API_URL", "");
    expect(await iamMode()).toBe("off");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
