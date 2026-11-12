import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeWebSocket } from "../../test/fake-websocket";
import { CONNECT_TIMEOUT_MS, connectHref, consoleSocketUrl, openConsoleSocket } from "./instance-console";

const ID = "i-0123456789abcdef0";
const https = { protocol: "https:", host: "console.example" };

describe("consoleSocketUrl", () => {
  it("is console-api's console path on the page's own host, wss for an https page and ws for an http one", () => {
    expect(consoleSocketUrl(https, ID, "vnc")).toBe(`wss://console.example/api/v1/instances/${ID}/console?kind=vnc`);
    expect(consoleSocketUrl({ protocol: "http:", host: "127.0.0.1:3000" }, ID, "serial")).toBe(
      `ws://127.0.0.1:3000/api/v1/instances/${ID}/console?kind=serial`,
    );
  });

  it.each([
    "",
    "i-1",
    "i-0123456789abcdef01",
    "I-0123456789ABCDEF0",
    "vol-0123456789abcdef0",
    ` ${ID}`,
    `${ID}/../../admin/regions`,
    `${ID}?kind=serial`,
    `${ID}#`,
    `${ID}%2F..`,
  ])("gives no URL for %j, which breaks the instance ID rule or would need encoding", (id) => {
    expect(consoleSocketUrl(https, id, "vnc")).toBeNull();
  });
});

describe("connectHref", () => {
  it("encodes the ID, so it stays one path segment", () => {
    expect(connectHref(ID)).toBe(`/compute/instances/${ID}/connect`);
    expect(connectHref("a/b?c#d")).toBe("/compute/instances/a%2Fb%3Fc%23d/connect");
  });
});

describe("openConsoleSocket", () => {
  const on = { connected: vi.fn(), ended: vi.fn() };
  const open = () => {
    const session = openConsoleSocket("ws://console.test/console", on);
    return { session, socket: FakeWebSocket.opened[0] };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    FakeWebSocket.reset();
    on.connected.mockReset();
    on.ended.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens one websocket on the URL, for binary frames", () => {
    const { session, socket } = open();
    expect(FakeWebSocket.opened).toHaveLength(1);
    expect(session.socket).toBe(socket);
    expect(socket.url).toBe("ws://console.test/console");
    expect(socket.binaryType).toBe("arraybuffer");
  });

  it("ends with the close code, and the reason when the server gave one", () => {
    open().socket.drop(1011, "console unavailable");
    expect(on.ended).toHaveBeenCalledExactlyOnceWith(
      "The console closed the connection: console unavailable (code 1011).",
    );
    on.ended.mockReset();
    FakeWebSocket.reset();
    open().socket.drop(1006);
    expect(on.ended).toHaveBeenCalledExactlyOnceWith("The console connection was closed (code 1006).");
  });

  it("ends once on an error and closes the socket; the close that follows changes nothing", () => {
    const { socket } = open();
    socket.fail();
    socket.drop(1006);
    expect(on.ended).toHaveBeenCalledExactlyOnceWith("The connection to the console failed.");
    expect(socket.close).toHaveBeenCalled();
  });

  it("ends a connect that takes longer than the timeout, and closes the socket", () => {
    const { socket } = open();
    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS - 1);
    expect(on.ended).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(on.ended).toHaveBeenCalledExactlyOnceWith("The console did not answer within 15 seconds.");
    expect(socket.close).toHaveBeenCalled();
  });

  it("leaves a connected console open past the timeout", () => {
    const { session, socket } = open();
    session.connected();
    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS * 2);
    expect(on.connected).toHaveBeenCalledTimes(1);
    expect(on.ended).not.toHaveBeenCalled();
    expect(socket.close).not.toHaveBeenCalled();
  });

  it("keeps the reason the page gave when it ends the session before the socket closes", () => {
    const { session, socket } = open();
    session.end("The VNC server asked for a password, which the console does not send.");
    socket.drop(1000);
    expect(on.ended).toHaveBeenCalledExactlyOnceWith(
      "The VNC server asked for a password, which the console does not send.",
    );
    expect(socket.close).toHaveBeenCalled();
  });

  it("closes the socket on dispose and reports nothing after it", () => {
    const { session, socket } = open();
    session.dispose();
    expect(socket.close).toHaveBeenCalledTimes(1);
    socket.fail();
    socket.drop(1006);
    session.connected();
    session.end("late");
    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS);
    expect(on.ended).not.toHaveBeenCalled();
    expect(on.connected).not.toHaveBeenCalled();
  });
});
