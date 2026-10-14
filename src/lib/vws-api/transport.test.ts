import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiTransportError, backoffMs, DEFAULT_TIMEOUT_MS, GET_ATTEMPTS, timeoutMs } from "./transport";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("apiFetch", () => {
  it("backs off with full jitter, capped at 2 s", () => {
    expect([1, 2, 3, 10].map((n) => backoffMs(n, () => 0.999))).toEqual([199, 399, 799, 1998]);
    expect(backoffMs(1, () => 0)).toBe(0);
  });

  it("uses a 10 s default timeout and VWS_CONSOLE_API_TIMEOUT_MS when it is a positive number", () => {
    expect(timeoutMs()).toBe(DEFAULT_TIMEOUT_MS);
    vi.stubEnv("VWS_CONSOLE_API_TIMEOUT_MS", "2500");
    expect(timeoutMs()).toBe(2500);
    vi.stubEnv("VWS_CONSOLE_API_TIMEOUT_MS", "-1");
    expect(timeoutMs()).toBe(DEFAULT_TIMEOUT_MS);
  });

  it("sleeps between GET attempts and gives up with a timeout error after the last one", async () => {
    const sleeps: number[] = [];
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason))));
    vi.stubGlobal("fetch", fetchMock);
    const error = await apiFetch("http://api.test/x", {}, { timeoutMs: 5, sleep: async (ms) => void sleeps.push(ms), random: () => 0.5 }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiTransportError);
    expect(error.kind).toBe("timeout");
    expect(error.attempts).toBe(GET_ATTEMPTS);
    expect(fetchMock).toHaveBeenCalledTimes(GET_ATTEMPTS);
    expect(sleeps).toEqual([100, 200]);
  });

  it("sends a POST once and a GET once when retry is off", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await apiFetch("http://api.test/x", { method: "POST" }, { sleep: async () => {} })).status).toBe(503);
    expect((await apiFetch("http://api.test/x", {}, { retry: false, sleep: async () => {} })).status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
