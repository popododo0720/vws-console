import { vi } from "vitest";

/**
 * A WebSocket for unit tests: nothing happens on it until the test says so. `next()` resolves with the next socket
 * the code under test opens, so a test waits for that event and not for time.
 */
export class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static opened: FakeWebSocket[] = [];
  private static waiting: ((socket: FakeWebSocket) => void)[] = [];

  static next(): Promise<FakeWebSocket> {
    return new Promise((resolve) => FakeWebSocket.waiting.push(resolve));
  }

  static reset() {
    FakeWebSocket.opened = [];
    FakeWebSocket.waiting = [];
  }

  readyState = FakeWebSocket.CONNECTING;
  binaryType = "blob";
  readonly send = vi.fn();
  readonly close = vi.fn(() => {
    this.readyState = FakeWebSocket.CLOSED;
  });

  constructor(readonly url: string) {
    super();
    FakeWebSocket.opened.push(this);
    FakeWebSocket.waiting.shift()?.(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  receive(data: ArrayBuffer | string) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }

  fail() {
    this.dispatchEvent(new Event("error"));
  }

  drop(code: number, reason = "") {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new CloseEvent("close", { code, reason }));
  }
}
