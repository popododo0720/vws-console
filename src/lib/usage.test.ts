// @vitest-environment node
import { describe, expect, it } from "vitest";
import { inclusiveWindow, rangeLabel, usagePresets, usageWindow } from "./usage";

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

describe("usagePresets", () => {
  it("offers Cost Explorer's ranges for past costs by its definitions, the last day excluded from `to`", () => {
    expect(usagePresets("2026-11-14").map(({ label, from, to }) => `${label}: ${from} ${to}`)).toEqual([
      "Last 1 Day: 2026-11-13 2026-11-14",
      "Last 7 Days: 2026-11-07 2026-11-14",
      "Last 3 Months: 2026-08-01 2026-11-01",
      "Last 6 Months: 2026-05-01 2026-11-01",
      "Last 12 Months: 2025-11-01 2026-11-01",
      "Month to Date: 2026-11-01 2026-11-15",
      "Year to Date: 2026-01-01 2026-11-15",
    ]);
  });

  // The first day of a year, the day after a leap day, and the last day of a leap year, whose year to date is 366 days.
  it.each(["2026-01-01", "2028-03-01", "2028-12-31"])("offers only windows console-api takes on %s", (today) => {
    for (const { from, to } of usagePresets(today)) expect(usageWindow(from, to)).toEqual({ from, to });
  });

  it("reaches the 366-day limit and stays inside it on the last day of a leap year", () => {
    expect(usagePresets("2028-12-31").at(-1)).toMatchObject({ from: "2028-01-01", to: "2029-01-01" });
  });
});

describe("a date range as a person reads it", () => {
  it("includes the To day in the window, and names a window by its first and last day", () => {
    expect(inclusiveWindow("2026-10-01", "2026-10-31")).toEqual({ from: "2026-10-01", to: "2026-11-01" });
    expect(inclusiveWindow("2026-10-31", "2026-10-31")).toEqual({ from: "2026-10-31", to: "2026-11-01" });
    expect(inclusiveWindow("2025-10-01", "2026-10-01")).toEqual({ from: "2025-10-01", to: "2026-10-02" });
    expect(rangeLabel({ from: "2026-10-01", to: "2026-11-01" })).toBe("2026-10-01 — 2026-10-31");
  });

  it.each([
    ["2026-10-02", "2026-10-01"],
    ["2026-10-01", ""],
    ["", "2026-10-01"],
    ["2025-10-01", "2026-10-02"],
  ])("refuses From %j with To %j", (from, last) => {
    expect(inclusiveWindow(from, last)).toBeNull();
  });
});
