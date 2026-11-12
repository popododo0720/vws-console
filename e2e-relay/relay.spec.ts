import { request as httpRequest } from "node:http";
import { connect } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const api = `http://127.0.0.1:${process.env.E2E_RELAY_API_PORT ?? 43322}`;
const secret = "relay-session-SENTINEL";
const route = "/api/v1/instances/i-00000001/console?kind=vnc";

test.beforeEach(async ({ request }) => {
  await request.get(`${api}/__close`);
  await request.get(`${api}/__reset`);
});

test("unauthenticated and malformed upgrades are refused before dialing", async ({ baseURL, request }) => {
  const refusal = (path: string, cookie?: string, origins = [baseURL!]) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const headers = [
        "Connection",
        "Upgrade",
        "Upgrade",
        "websocket",
        "Sec-WebSocket-Key",
        "dGhlIHNhbXBsZSBub25jZQ==",
        "Sec-WebSocket-Version",
        "13",
        ...origins.flatMap((origin) => ["Origin", origin]),
        ...(cookie === undefined ? [] : ["Cookie", cookie]),
      ];
      const req = httpRequest(`${baseURL}${path}`, { headers, timeout: 5000 }, (response) => {
        let body = "";
        response.on("data", (data: Buffer) => {
          body += data.toString();
        });
        response.on("end", () => resolve({ status: response.statusCode!, body }));
      });
      req.on("timeout", () => req.destroy(new Error("refusal timed out")));
      req.on("error", reject);
      req.end();
    });
  expect((await refusal(route)).status).toBe(401);
  for (const path of [
    "/api/v1/instances/i-123/console?kind=vnc",
    "/api/v1/instances/i-00000001/console?kind=serial&extra=secret",
    "/api/v1/instances/i-00000001/console?kind=vnc&kind=serial",
  ])
    expect((await refusal(path, `vws_session=${secret}`)).status).toBe(400);
  expect((await refusal("/other", `vws_session=${secret}`)).status).toBe(404);
  expect((await refusal(route, `vws_session=${secret}`, [])).status).toBe(400);
  expect((await refusal(route, `vws_session=${secret}`, [baseURL!, baseURL!])).status).toBe(400);
  expect((await refusal(route, `vws_session=${"x".repeat(4097)}`)).status).toBe(431);
  expect((await request.get(`${api}/healthz`)).ok()).toBeTruthy();
  expect(await (await request.get(`${api}/__stats`)).json()).toMatchObject({ dials: 0 });
  const refused = await refusal(route.replace("i-00000001", "i-00000003"), `vws_session=${secret}`);
  expect(refused).toEqual({ status: 403, body: "" });
  expect(JSON.stringify(refused)).not.toContain(secret);
  expect((await refusal(route.replace("i-00000001", "i-00000004"), `vws_session=${secret}`)).status).toBe(504);
});

test("binary banner and echo, serial text, repeated connections, and browser close", async ({
  context,
  page,
  baseURL,
  request,
}) => {
  await context.addCookies([
    { name: "vws_session", value: secret, url: baseURL! },
    { name: "other", value: "do-not-forward", url: baseURL! },
  ]);
  await page.goto("/healthz");
  for (const kind of ["vnc", "serial", "serial"]) {
    const result = await page.evaluate(
      async ({ kind, route }) => {
        return await new Promise<{ binary: boolean; text: string; echo: string }>((resolve, reject) => {
          const ws = new WebSocket(
            `${location.origin.replace("http", "ws")}${route.replace("kind=vnc", `kind=${kind}`)}`,
          );
          ws.binaryType = "arraybuffer";
          const deadline = setTimeout(() => {
            ws.close();
            reject(new Error("websocket timed out"));
          }, 5000);
          let banner = "";
          let binary = false;
          ws.onerror = () => {
            clearTimeout(deadline);
            reject(new Error("websocket failed"));
          };
          ws.onopen = () => {
            if (kind === "serial") ws.send("serial hello");
          };
          ws.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
            if (kind === "vnc" && !banner) {
              binary = event.data instanceof ArrayBuffer;
              banner = new TextDecoder().decode(event.data as ArrayBuffer);
              ws.send(new Uint8Array([0, 128, 255]));
            } else {
              const echo =
                typeof event.data === "string" ? event.data : Array.from(new Uint8Array(event.data)).join(",");
              ws.onclose = () => {
                clearTimeout(deadline);
                resolve({ binary, text: banner, echo });
              };
              ws.close();
            }
          };
        });
      },
      { kind, route },
    );
    expect(result).toEqual(
      kind === "vnc"
        ? { binary: true, text: "RFB 003.008\n", echo: "0,128,255" }
        : { binary: false, text: "", echo: "serial hello" },
    );
  }
  const stats = await (await request.get(`${api}/__stats`)).json();
  expect(stats.dials).toBe(3);
  for (const seen of stats.seen) {
    expect(seen.cookie).toBe(`__Host-vws_session=${secret}`);
    expect(seen.origin).toBe(baseURL);
    expect(seen.path).not.toContain(secret);
  }
  await expect.poll(async () => (await (await request.get(`${api}/__stats`)).json()).active).toBe(0);
});

test("upstream loss closes the browser and the next connection is independent", async ({
  context,
  page,
  baseURL,
  request,
}) => {
  await context.addCookies([{ name: "vws_session", value: secret, url: baseURL! }]);
  await page.goto("/healthz");
  await page.evaluate(async (route) => {
    const ws = new WebSocket(`${location.origin.replace("http", "ws")}${route}`);
    const state = window as typeof window & { relayClosed?: Promise<void> };
    state.relayClosed = new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error("close timed out")), 5000);
      ws.onclose = () => {
        clearTimeout(deadline);
        resolve();
      };
    });
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("connect failed"));
    });
  }, route);
  await request.get(`${api}/__close`);
  await page.evaluate(async () => {
    await (window as typeof window & { relayClosed: Promise<void> }).relayClosed;
  });
  await page.evaluate(async (route) => {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${location.origin.replace("http", "ws")}${route}`);
      const deadline = setTimeout(() => {
        ws.close();
        reject(new Error("idle close timed out"));
      }, 5000);
      ws.onclose = () => {
        clearTimeout(deadline);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(deadline);
        reject(new Error("reconnect failed"));
      };
    });
  }, route);
  expect(await (await request.get(`${api}/__stats`)).json()).toMatchObject({ dials: 2 });
});

test("browser head bytes are delivered before piping subsequent frames", async ({ baseURL }) => {
  const url = new URL(baseURL!);
  await new Promise<void>((resolve, reject) => {
    const socket = connect(Number(url.port), url.hostname);
    socket.setTimeout(5000, () => socket.destroy(new Error("head echo timed out")));
    socket.on("error", reject);
    let received = Buffer.alloc(0);
    socket.on("data", (data) => {
      received = Buffer.concat([received, data]);
      const end = received.indexOf("\r\n\r\n");
      if (end < 0) return;
      if (!received.subarray(0, end).toString().startsWith("HTTP/1.1 101")) {
        socket.destroy();
        return reject(new Error("upgrade refused"));
      }
      if (received.length >= end + 7) {
        expect(received.subarray(end + 4)).toEqual(Buffer.from([0x81, 1, 65]));
        socket.destroy();
        resolve();
      }
    });
    socket.on("connect", () =>
      socket.write(
        Buffer.concat([
          Buffer.from(
            `GET ${route.replace("kind=vnc", "kind=serial")} HTTP/1.1\r\nHost: ${url.host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nOrigin: ${baseURL}\r\nCookie: vws_session=${secret}\r\n\r\n`,
          ),
          Buffer.from([0x81, 0x81, 1, 2, 3, 4, 64]),
        ]),
      ),
    );
  });
});

test("an unreachable upstream gives 502 and a safe structured log", async () => {
  const port = Number(process.env.E2E_RELAY_PORT ?? 43128) + 10;
  const dir = process.env.E2E_RELAY_STANDALONE_DIR ? resolve(process.env.E2E_RELAY_STANDALONE_DIR) : process.cwd();
  const child = spawn(process.execPath, ["server/console-server.mts", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: dir,
    env: {
      ...process.env,
      VWS_CONSOLE_API_URL: "http://127.0.0.1:1",
      METRICS_PORT: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (data: Buffer) => {
    logs += data.toString();
  });
  child.stderr.on("data", (data: Buffer) => {
    logs += data.toString();
  });
  const exited = once(child, "exit");
  try {
    await expect.poll(() => logs.includes('"event":"server.listen"'), { timeout: 20_000 }).toBeTruthy();
    const response = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        `http://127.0.0.1:${port}${route}`,
        {
          headers: {
            connection: "Upgrade",
            upgrade: "websocket",
            "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
            "sec-websocket-version": "13",
            origin: `http://127.0.0.1:${port}`,
            cookie: `vws_session=${secret}`,
          },
          timeout: 5000,
        },
        (response) => {
          response.resume();
          resolve(response.statusCode!);
        },
      );
      req.on("error", reject);
      req.on("timeout", () => req.destroy(new Error("unreachable refusal timed out")));
      req.end();
    });
    expect(response).toBe(502);
    await expect.poll(() => logs.includes('"code":"UpstreamUnreachable"')).toBeTruthy();
    expect(logs).not.toContain(secret);
    expect(logs).not.toContain("kind=");
    const line = logs.split("\n").find((line) => line.includes('"code":"UpstreamUnreachable"'))!;
    expect(JSON.parse(line)).toMatchObject({
      event: "console.relay.refuse",
      status: 502,
      level: "warn",
    });
  } finally {
    child.kill("SIGTERM");
    await exited;
  }
});
