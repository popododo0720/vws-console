import { request as httpRequest, STATUS_CODES, type IncomingMessage, type OutgoingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import type { Duplex } from "node:stream";
import { isInstanceId } from "../src/lib/instance-id.ts";
import { isRegionName } from "../src/lib/region-name.ts";
import { API_SESSION_COOKIE, SESSION_COOKIE } from "../src/lib/vws-api/session-cookies.ts";

type Handshake = { path: string; headers: OutgoingHttpHeaders };
type Validation = { status: number } | Handshake;

/** `kind` exactly once and `region` at most once, in either order, each pair literal; null for anything else. */
function consoleQuery(query: string): { kind: string; region?: string } | null {
  let kind: string | undefined;
  let region: string | undefined;
  for (const pair of query.split("&")) {
    const named = /^kind=(vnc|serial)$/.exec(pair);
    if (named && kind === undefined) kind = named[1];
    else if (pair.startsWith("region=") && region === undefined && isRegionName(pair.slice(7))) region = pair.slice(7);
    else return null;
  }
  return kind === undefined ? null : { kind, region };
}

export function validateUpgrade(request: Pick<IncomingMessage, "url" | "headers" | "rawHeaders">): Validation {
  const [path, query, ...extra] = (request.url ?? "").split("?");
  const match = /^\/api\/v1\/instances\/([^/]+)\/console$/.exec(path);
  if (!match) return { status: 404 };
  const parsed = consoleQuery(query ?? "");
  if (!isInstanceId(match[1]) || extra.length || !parsed) return { status: 400 };
  const sessions = (request.headers.cookie ?? "")
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => pair.startsWith(`${SESSION_COOKIE}=`))
    .map((pair) => pair.slice(SESSION_COOKIE.length + 1));
  if (!sessions.length || !sessions[0]) return { status: 401 };
  if (sessions.length !== 1) return { status: 400 };
  const session = sessions[0];
  if (session.length > 4096) return { status: 431 };
  // Cookie-octets exclude separators and control characters, so this remains exactly one cookie.
  if (!/^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]+$/.test(session)) return { status: 400 };
  let origins = 0;
  for (let index = 0; index < request.rawHeaders.length; index += 2)
    if (request.rawHeaders[index].toLowerCase() === "origin") origins++;
  const origin = request.headers.origin;
  if (origins !== 1 || !origin || origin.includes(",")) return { status: 400 };
  const headers: OutgoingHttpHeaders = {
    connection: "Upgrade",
    upgrade: "websocket",
    cookie: `${API_SESSION_COOKIE}=${session}`,
    origin,
  };
  for (const name of [
    "sec-websocket-key",
    "sec-websocket-version",
    "sec-websocket-protocol",
    "sec-websocket-extensions",
  ]) {
    const value = request.headers[name];
    if (value !== undefined) headers[name] = value;
  }
  if (parsed.region !== undefined) headers["x-vws-region"] = parsed.region;
  return { path: `${path}?kind=${parsed.kind}`, headers };
}

export function relayUpgrade(request: IncomingMessage, browser: Duplex, head: Buffer): void {
  const started = performance.now();
  let upstream: Duplex | undefined;
  let dial: ReturnType<typeof httpRequest> | undefined;
  let opened = false;
  let finished = false;
  const log = (event: "open" | "close" | "refuse", status: number, code?: string) => {
    const line = {
      level: status >= 500 ? "warn" : "info",
      service: "vws-console",
      event: `console.relay.${event}`,
      status,
      durationMs: Math.round(performance.now() - started),
      ...(code ? { code } : {}),
    };
    // eslint-disable-next-line no-console -- allow-listed structured server sink, with no request values
    (status >= 500 ? console.warn : console.info)(JSON.stringify(line));
  };
  const cleanup = () => {
    clearTimeout(timer);
    dial?.destroy();
    upstream?.destroy();
    if (!finished) {
      finished = true;
      log(opened ? "close" : "refuse", opened ? 101 : 499, "PeerClosed");
    }
  };
  const refuse = (status: number, code?: string) => {
    if (finished || opened) return;
    finished = true;
    clearTimeout(timer);
    log("refuse", status, code);
    browser.end(
      `HTTP/1.1 ${status} ${STATUS_CODES[status] ?? "Refused"}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
    );
    dial?.destroy();
    upstream?.destroy();
  };
  const configuredTimeout = Number(process.env.VWS_CONSOLE_API_TIMEOUT_MS);
  const handshakeMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 10_000;
  const timer = setTimeout(() => refuse(504, "HandshakeTimeout"), handshakeMs);
  browser.on("error", () => browser.destroy());
  browser.on("close", cleanup);
  const validated = validateUpgrade(request);
  if ("status" in validated) return refuse(validated.status);
  const base = process.env.VWS_CONSOLE_API_URL?.replace(/\/+$/, "");
  if (!base) return refuse(503, "ConsoleNotConfigured");
  let target: URL;
  try {
    target = new URL(`${base}${validated.path}`);
    if (!["http:", "https:"].includes(target.protocol) || target.username || target.password || target.hash)
      return refuse(503, "ConsoleNotConfigured");
  } catch {
    return refuse(503, "ConsoleNotConfigured");
  }
  try {
    dial = (target.protocol === "https:" ? httpsRequest : httpRequest)(target, {
      method: "GET",
      headers: validated.headers,
    });
    dial.on("response", (response) => {
      refuse(response.statusCode ?? 502, "UpstreamRefused");
      response.destroy();
    });
    dial.on("error", () => refuse(502, "UpstreamUnreachable"));
    dial.on("upgrade", (response, socket, upstreamHead) => {
      if (finished || browser.destroyed) return socket.destroy();
      clearTimeout(timer);
      upstream = socket;
      opened = true;
      const lines = [`HTTP/1.1 101 Switching Protocols`];
      for (let index = 0; index < response.rawHeaders.length; index += 2)
        lines.push(`${response.rawHeaders[index]}: ${response.rawHeaders[index + 1]}`);
      browser.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (upstreamHead.length) browser.write(upstreamHead);
      if (head.length) socket.write(head);
      const configuredIdle = Number(process.env.VWS_CONSOLE_RELAY_IDLE_TIMEOUT_MS);
      const idleMs = Number.isFinite(configuredIdle) && configuredIdle > 0 ? configuredIdle : 300_000;
      const close = () => {
        browser.destroy();
        socket.destroy();
      };
      request.socket.setTimeout(idleMs, close);
      socket.setTimeout(idleMs, close);
      socket.on("error", close);
      socket.on("close", () => browser.destroy());
      log("open", 101);
      browser.pipe(socket).pipe(browser);
    });
    dial.end();
  } catch {
    refuse(502, "UpstreamUnreachable");
  }
}
