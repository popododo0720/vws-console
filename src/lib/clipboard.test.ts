import { afterEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "@/lib/clipboard";

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

describe("copyToClipboard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns true when the write succeeds", async () => {
    stubClipboard(async () => {});
    expect(await copyToClipboard("i-123", "test")).toBe(true);
  });

  it("returns false and reports the error when the write is denied", async () => {
    const sink = vi.spyOn(console, "error").mockImplementation(() => {});
    stubClipboard(async () => {
      throw Object.assign(new Error("denied"), { name: "NotAllowedError", code: "NotAllowedError" });
    });
    expect(await copyToClipboard("i-123", "copy-test")).toBe(false);
    expect(sink).toHaveBeenCalledWith("[vws-console]", {
      context: "copy-test",
      code: "NotAllowedError",
      message: "denied",
      requestId: null,
    });
  });
});
