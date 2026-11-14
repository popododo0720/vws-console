// @vitest-environment node
import { describe, expect, it } from "vitest";
import { usageWindow } from "./usage";

describe("usageWindow", () => {
  it("passes a window console-api takes: real days, from before to, at most 366 days apart", () => {
    expect(usageWindow("2026-10-01", "2026-11-01")).toEqual({ from: "2026-10-01", to: "2026-11-01" });
    expect(usageWindow("2026-11-14", "2026-11-15")).not.toBeNull();
    // 366 days: 2028-02-29 is inside.
    expect(usageWindow("2027-03-01", "2028-03-01")).not.toBeNull();
  });

  // The windows console-api's own test refuses (usage_test.go), and what a URL can carry in place of a date.
  it.each([
    [undefined, undefined],
    ["2026-10-01", undefined],
    ["bad", "2026-11-01"],
    ["2026-02-30", "2026-11-01"],
    ["2026-1-01", "2026-11-01"],
    ["2026-11-01", "2026-11-01"],
    ["2026-11-02", "2026-11-01"],
    ["2020-01-01", "2026-11-01"],
    ["2027-03-01", "2028-03-02"],
    [["2026-10-01", "2026-10-01"], "2026-11-01"],
    ["2026-10-01T00:00:00Z", "2026-11-01"],
    [" 2026-10-01", "2026-11-01"],
    ["<img src=x onerror=alert(1)>", "2026-11-01"],
  ])("refuses from %j to %j", (from, to) => {
    expect(usageWindow(from, to)).toBeNull();
  });
});
