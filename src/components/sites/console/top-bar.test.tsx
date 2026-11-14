import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseBucketName, type ApiResult, type Region } from "@/lib/vws-api/adapter";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { TopBar } from "@/components/sites/console/top-bar";

const nav = vi.hoisted(() => ({ search: "", refresh: vi.fn() }));

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: nav.refresh }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

beforeEach(() => {
  nav.search = "";
  nav.refresh.mockClear();
});

describe("TopBar region menu", () => {
  const listed: ApiResult<Region[]> = {
    ok: true,
    value: [
      { name: "pve-busan-1", kind: "pve", state: "degraded" },
      { name: "pve-seoul-1", kind: "pve", state: "available" },
      { name: "us-east-1", kind: "aws", state: "unavailable" },
    ],
  };
  const open = (regions: ApiResult<Region[]>, label: string) => {
    render(
      <ConsoleProvider regions={regions}>
        <TopBar onMenu={() => {}} />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: label }));
    return screen.getAllByRole("menuitem");
  };

  it("lists All regions and each region console-api returned with its state, keeping the rest of the query", () => {
    nav.search = "tab=a&region=pve-seoul-1";
    const items = open(listed, "pve-seoul-1");
    expect(items.map((item) => [item.textContent, item.getAttribute("href")])).toEqual([
      ["All regions", "?tab=a&region=all"],
      ["pve-busan-1Degraded", "?tab=a&region=pve-busan-1"],
      ["pve-seoul-1Available", "?tab=a&region=pve-seoul-1"],
      ["us-east-1Unavailable", "?tab=a&region=us-east-1"],
    ]);
    const dots = items.map((item) => item.querySelector<HTMLElement>("span.rounded-full")?.style.background);
    expect(dots).toEqual([undefined, "rgb(141, 102, 5)", "rgb(3, 127, 12)", "rgb(209, 50, 18)"]);
  });

  it("shows the first region, and nothing of the value, for a ?region= console-api did not list", () => {
    nav.search = "region=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E";
    open(listed, "pve-busan-1");
    expect(document.body.innerHTML).not.toContain("onerror");
  });

  it("shows an error state with the code, and reads the list again on Try again", () => {
    const error = { code: "ServiceUnavailable", message: "The VWS console API did not answer.", requestId: null };
    const [failed, retry] = open({ ok: false, error }, "Region");
    expect(failed).toBeDisabled();
    expect(failed).toHaveTextContent("Regions could not be loaded (ServiceUnavailable)");
    fireEvent.click(retry);
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("TopBar account menu", () => {
  it("shows the signed-in user and account ID", () => {
    render(
      <ConsoleProvider identity={{ userName: "alice", accountId: "123456789012" }} signIn>
        <TopBar onMenu={() => {}} />
      </ConsoleProvider>,
    );
    const button = screen.getByRole("button", { name: /alice/ });
    expect(button).toHaveTextContent("123456789012");
    expect(screen.queryByText("demo.operator")).toBeNull();
    fireEvent.click(button);
    expect(screen.getByRole("menuitem", { name: "Account 123456789012" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeTruthy();
  });

  it("shows a dash when no session is known", () => {
    render(
      <ConsoleProvider>
        <TopBar onMenu={() => {}} />
      </ConsoleProvider>,
    );
    expect(screen.getByRole("button", { name: /—/ })).toHaveTextContent("——");
  });

  it("offers no Sign out with IAM off", () => {
    render(
      <ConsoleProvider>
        <TopBar onMenu={() => {}} />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /—/ }));
    expect(screen.queryByRole("menuitem", { name: "Sign out" })).toBeNull();
  });

  it("lists Regions under Services only for a caller granted vws:AdminListRegions", () => {
    const bar = (adminActions: string[]) => (
      <ConsoleProvider adminActions={adminActions}>
        <TopBar onMenu={() => {}} />
      </ConsoleProvider>
    );
    const view = render(bar(["vws:AdminListAwsAccounts"]));
    fireEvent.click(screen.getByRole("button", { name: "Services" }));
    expect(screen.getByRole("menuitem", { name: "Instances" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Billing and Cost Management" })).toHaveAttribute("href", "/billing");
    expect(screen.queryByRole("menuitem", { name: "Regions" })).toBeNull();
    view.rerender(bar(["vws:AdminListRegions"]));
    expect(screen.getByRole("menuitem", { name: "Regions" }).getAttribute("href")).toBe("/admin/regions");
  });

  it("links an account bucket to its page and ignores sample buckets", () => {
    const name = parseBucketName("logs-1");
    if (!name) throw new Error("logs-1");
    render(
      <ConsoleProvider accountBuckets={[{ name, ownerId: "1", created: "2026-08-02T00:00:00Z" }]}>
        <TopBar onMenu={() => {}} />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /—/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Show sample data" }));
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "logs" } });
    expect(screen.getByRole("link", { name: /logs-1/ }).getAttribute("href")).toBe("/storage/buckets/logs-1");
    expect(screen.queryByRole("link", { name: /vws-logs/ })).toBeNull();
  });
});
