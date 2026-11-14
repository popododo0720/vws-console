import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { WINDOW_RULE } from "@/lib/usage";
import Page from "./page";

const nav = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), search: "" }));

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/lib/vws-api/session", () => ({ currentSession: async () => ({ session: "sess-1", csrf: "csrf-1" }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/billing",
  useRouter: () => nav,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

/** The items the e2e fake console-api serves: pve-lab-1 and pve-lab-2 with an allocation, pve-down-1 without. */
const items: unknown = JSON.parse(readFileSync("e2e-admin/testdata/usage.json", "utf8"));
const failure = (code: string, message: string) => ({ error: { code, message }, requestId: "req-7" });
const OCTOBER = { from: "2026-10-01", to: "2026-11-01" };

type Reply = [number, unknown];
const calls: string[] = [];

/** GET /usage at the wire: `replies` are served first, in order, then the fixture with the window that was asked for. */
function usageApi(...replies: Reply[]) {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const { pathname, search, searchParams } = new URL(url);
    calls.push(`${init.method ?? "GET"} ${pathname}${search}`);
    const asked = { from: searchParams.get("from"), to: searchParams.get("to") };
    const [status, body] = replies.shift() ?? [200, { ...asked, items }];
    return new Response(JSON.stringify(body), { status });
  });
}

type Query = Record<string, string | string[]>;
const show = async (query: Query = {}) =>
  render(<ConsoleProvider>{await Page({ searchParams: Promise.resolve(query) })}</ConsoleProvider>);
const rows = () => screen.getAllByRole("row").map((row) => [...row.children].map((cell) => cell.textContent).join("|"));
const field = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const sent = (range: { from: string; to: string }) => `GET /api/v1/usage?from=${range.from}&to=${range.to}`;

describe("Billing and Cost Management home on a wire-level usage API", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-11-14T09:00:00Z"), toFake: ["Date"] });
    vi.stubEnv("VWS_CONSOLE_API_URL", "http://api.test");
    vi.stubEnv("VWS_CONSOLE_IAM", "on");
    // No wait between the transport's GET retries.
    vi.spyOn(Math, "random").mockReturnValue(0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetAllMocks();
    calls.length = 0;
    nav.search = "";
  });

  it("shows each region's usage and the totals, and a dash for the region console-api could not read", async () => {
    usageApi();
    await show();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Billing and Cost Management home");
    expect(calls).toEqual([sent({ from: "2026-05-01", to: "2026-11-01" })]);
    expect(rows()).toEqual([
      "Region|vCPUs|Memory (GiB)|Storage (GiB)",
      "pve-down-1|—|—|—",
      "pve-lab-1|6|8|120",
      "pve-lab-2|2.5|1.5|40.25",
    ]);
    const summary = ["vCPUs", "Memory (GiB)", "Storage (GiB)", "Regions with data", "Project ID", "Date range"];
    expect(summary.map(field)).toEqual(["8.5", "9.5", "160.25", "2 of 3", "123456789012", "2026-05-01 — 2026-10-31"]);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Usage could not be read in every regionNo data for pve-down-1.Unavailable · Request ID —",
    );
  });

  it("sends the from and to of the URL as they are, on every render, and never a write", async () => {
    usageApi();
    await show({ ...OCTOBER, region: "pve-lab-1" });
    await show({ ...OCTOBER, region: "pve-lab-1" });
    expect(calls).toEqual([sent(OCTOBER), sent(OCTOBER)]);
    expect(screen.getAllByRole("button", { name: /Date range/ })[0]).toHaveTextContent("2026-10-01 — 2026-10-31");
  });

  it("offers each range as a link that keeps the rest of the URL, and marks the one in use", async () => {
    nav.search = "region=pve-lab-1&from=2026-05-01&to=2026-11-01";
    usageApi();
    await show({ from: "2026-05-01", to: "2026-11-01" });
    click(/Date range/);
    const offered = screen
      .getAllByRole("menuitem")
      .map((item) => [
        item.textContent,
        item.getAttribute("href"),
        item.querySelector("svg")?.classList.contains("opacity-100"),
      ]);
    expect(offered).toEqual([
      ["Last 1 Day", "?region=pve-lab-1&from=2026-11-13&to=2026-11-14", false],
      ["Last 7 Days", "?region=pve-lab-1&from=2026-11-07&to=2026-11-14", false],
      ["Last 3 Months", "?region=pve-lab-1&from=2026-08-01&to=2026-11-01", false],
      ["Last 6 Months", "?region=pve-lab-1&from=2026-05-01&to=2026-11-01", true],
      ["Last 12 Months", "?region=pve-lab-1&from=2025-11-01&to=2026-11-01", false],
      ["Month to Date", "?region=pve-lab-1&from=2026-11-01&to=2026-11-15", false],
      ["Year to Date", "?region=pve-lab-1&from=2026-01-01&to=2026-11-15", false],
      ["Custom", null, false],
    ]);
  });

  it("applies a custom range with both days included, and refuses one that ends before it starts", async () => {
    nav.search = "region=pve-lab-1";
    usageApi();
    await show(OCTOBER);
    click(/Date range/);
    fireEvent.click(screen.getByRole("menuitem", { name: "Custom" }));
    expect(
      [screen.getByLabelText("From"), screen.getByLabelText("To")].map((input) => input.getAttribute("value")),
    ).toEqual(["2026-10-01", "2026-10-31"]);
    fill("To", "2026-09-30");
    click("Apply");
    expect(screen.getByRole("dialog")).toHaveTextContent(WINDOW_RULE);
    expect(nav.push).not.toHaveBeenCalled();
    fill("From", "2026-09-01");
    click("Apply");
    expect(nav.push).toHaveBeenCalledWith("?region=pve-lab-1&from=2026-09-01&to=2026-10-01");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each<[string, Query]>([
    ["only a from", { from: "2026-10-01" }],
    ["a to before the from", { from: "2026-11-01", to: "2026-10-01" }],
    ["more than 366 days", { from: "2025-10-01", to: "2026-11-01" }],
    ["a repeated from", { from: ["2026-10-01", "2026-10-02"], to: "2026-11-01" }],
    ["markup in place of a date", { from: "<img src=x onerror=alert(1)>", to: "2026-11-01" }],
  ])("refuses %s in the URL without calling console-api, and still offers the ranges", async (_case, query) => {
    usageApi();
    const view = await show(query);
    expect(calls).toEqual([]);
    expect(screen.getByRole("alert")).toHaveTextContent(
      `Usage could not be loaded${WINDOW_RULE}InvalidArgument · Request ID —`,
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(view.container.innerHTML).not.toContain("onerror");
    click(/Date range/);
    expect(screen.getAllByRole("menuitem")).toHaveLength(8);
  });

  it.each<[string, Reply[], string]>([
    ["a 403", [[403, failure("PermissionDenied", "vws:GetUsage is not allowed")]], "vws:GetUsage is not allowed"],
    ["a 503 on every try", Array(3).fill([503, failure("Unavailable", "admin registry unavailable")]), "Unavailable"],
    ["an answer without items", [[200, OCTOBER]], "MalformedResponse · Request ID"],
    ["an answer without the window", [[200, { items }]], "MalformedResponse · Request ID"],
  ])("shows %s as a load error with its code, never a blank page or a table", async (_case, replies, text) => {
    usageApi(...replies);
    await show(OCTOBER);
    expect(calls).toHaveLength(replies.length);
    expect(screen.getByRole("alert")).toHaveTextContent("Usage could not be loaded");
    expect(screen.getByRole("alert")).toHaveTextContent(text);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("reads again after a 503 and shows the usage of the second answer", async () => {
    usageApi([503, failure("Unavailable", "admin registry unavailable")]);
    await show(OCTOBER);
    expect(calls).toEqual([sent(OCTOBER), sent(OCTOBER)]);
    expect(rows()).toHaveLength(4);
  });

  it("says so when a project has no Proxmox region, and when the answer names no project", async () => {
    usageApi(
      [200, { ...OCTOBER, items: [{ project: "123456789012", regions: [] }] }],
      [200, { ...OCTOBER, items: [] }],
    );
    const empty = await show(OCTOBER);
    expect(screen.getByText("No regions found")).toBeTruthy();
    expect(["vCPUs", "Regions with data"].map(field)).toEqual(["—", "0 of 0"]);
    expect(screen.queryByRole("alert")).toBeNull();
    empty.unmount();
    await show(OCTOBER);
    expect(screen.getByText("No usage to display")).toBeTruthy();
  });
});
