// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as healthz } from "@/app/healthz/route";
import { GET as readyz } from "@/app/readyz/route";
import { READY_TIMEOUT_MS } from "./readiness";

const SECRET = "s3cr3t-token-value";

describe("/healthz", () => {
  it("answers 200 JSON without calling anything", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = healthz();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("/readyz", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv("VWS_CONSOLE_API_URL", "http://api.test/");
    vi.stubEnv("VWS_CONSOLE_IAM", "");
    vi.stubEnv("VWS_CONSOLE_API_TOKEN", SECRET);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function probe() {
    const response = await readyz();
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("api.test");
    return { status: response.status, body: JSON.parse(text) };
  }

  it("is ready when console-api answers, 401 included, with one unauthenticated call", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const { status, body } = await probe();
    expect(status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      checks: [
        { name: "config", status: "pass" },
        { name: "console-api", status: "pass" },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://api.test/api/v1/auth/session");
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBeUndefined();
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("is ready with local data only when console-api is not configured", async () => {
    vi.stubEnv("VWS_CONSOLE_API_URL", "");
    const { status, body } = await probe();
    expect(status).toBe(200);
    expect(body.checks[1]).toMatchObject({ name: "console-api", status: "skip" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 503 once when console-api answers 5xx (no retry)", async () => {
    fetchMock.mockResolvedValue(new Response("upstream detail " + SECRET, { status: 503 }));
    const { status, body } = await probe();
    expect(status).toBe(503);
    expect(body.status).toBe("unavailable");
    expect(body.checks[1]).toEqual({ name: "console-api", status: "fail", reason: "console-api answered 503" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("answers 503 when console-api cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed: connect ECONNREFUSED http://api.test"));
    const { status, body } = await probe();
    expect(status).toBe(503);
    expect(body.checks[1]).toEqual({ name: "console-api", status: "fail", reason: "console-api could not be reached" });
  });

  it("answers 503 when console-api does not answer in time", { timeout: READY_TIMEOUT_MS + 3_000 }, async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    // Real timers: the probe's own AbortSignal deadline ends the hung call after READY_TIMEOUT_MS.
    const { status, body } = await probe();
    expect(status).toBe(503);
    expect(body.checks[1].reason).toBe(`console-api did not answer within ${READY_TIMEOUT_MS} ms`);
  });

  it("answers 503 without calling console-api when the configuration is invalid", async () => {
    vi.stubEnv("VWS_CONSOLE_IAM", "yes");
    const { status, body } = await probe();
    expect(status).toBe(503);
    expect(body.checks).toEqual([
      { name: "config", status: "fail", reason: 'VWS_CONSOLE_IAM must be "on", "off" or unset' },
      { name: "console-api", status: "skip", reason: "configuration is invalid" },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 503 for a console-api URL that is not http(s)", async () => {
    vi.stubEnv("VWS_CONSOLE_API_URL", "ftp://api.test");
    const { status, body } = await probe();
    expect(status).toBe(503);
    expect(body.checks[0]).toEqual({
      name: "config",
      status: "fail",
      reason: "VWS_CONSOLE_API_URL is not an http(s) URL",
    });
  });
});
