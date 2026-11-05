import { act, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { InstancesView, elapsedLabel } from "@/components/sites/console/instances-view";

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/app/actions/resources", () => ({
  renameInstanceAction: vi.fn(),
  startInstancesAction: vi.fn(),
  stopInstancesAction: vi.fn(),
  terminateInstancesAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/compute/instances",
  useSearchParams: () => new URLSearchParams(),
}));

function renderEmpty() {
  render(
    <ConsoleProvider>
      <InstancesView instances={[]} loadError={null} />
    </ConsoleProvider>,
  );
}

describe("InstancesView parity", () => {
  it("lists the reference columns in the reference order", () => {
    renderEmpty();
    const headers = within(screen.getByRole("table"))
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent?.trim())
      .filter(Boolean);
    expect(headers.slice(0, 10)).toEqual([
      "Name",
      "Instance ID",
      "Instance state",
      "Instance type",
      "Status check",
      "Availability Zone",
      "Public IPv4 DNS",
      "Public IPv4 address",
      "Elastic IP",
      "IPv6 IPs",
    ]);
  });

  it("shows the empty state, the filter wording and Last updated", () => {
    renderEmpty();
    expect(screen.getByText("No instances")).toBeTruthy();
    expect(screen.getByText("You do not have any instances in this region")).toBeTruthy();
    const launches = screen.getAllByRole("link", { name: "Launch instances" });
    expect(launches.every((link) => link.getAttribute("href") === "/compute/launch")).toBe(true);
    expect(screen.getByPlaceholderText("Filter Instance by attribute or tag (case-sensitive)")).toBeTruthy();
    expect(screen.getByText(/Last updated/).textContent).toContain("less than a minute ago");
  });

  it("summarizes alarms, service health and health events under All instances", () => {
    renderEmpty();
    expect(screen.getByRole("heading", { name: "All instances" })).toBeTruthy();
    const alarms = screen.getByRole("heading", { name: "Instance alarm states" }).closest("article");
    expect(alarms?.textContent).toContain("In alarm");
    const health = screen.getByRole("heading", { name: "Service health" }).closest("article");
    expect(health?.textContent).toContain("Operating normally");
    const events = screen.getByRole("heading", { name: "Health events affecting EC2 instances" }).closest("article");
    expect(events?.textContent).toContain("Open events");
    expect(events?.textContent).toContain("Upcoming events");
  });

  it("ages Last updated and resets it when new data arrives", () => {
    vi.useFakeTimers();
    try {
      const view = render(
        <ConsoleProvider>
          <InstancesView instances={[]} loadError={null} />
        </ConsoleProvider>,
      );
      act(() => vi.advanceTimersByTime(10 * 60_000));
      expect(screen.getByText(/Last updated/).textContent).toContain("10 minutes ago");
      view.rerender(
        <ConsoleProvider>
          <InstancesView instances={[]} loadError={null} />
        </ConsoleProvider>,
      );
      expect(screen.getByText(/Last updated/).textContent).toContain("less than a minute ago");
    } finally {
      vi.useRealTimers();
    }
  });

  it("formats elapsed time in minutes and hours", () => {
    expect(elapsedLabel(59_999)).toBe("less than a minute ago");
    expect(elapsedLabel(60_000)).toBe("1 minute ago");
    expect(elapsedLabel(3 * 3_600_000)).toBe("3 hours ago");
  });

  it("does not report healthy status when instances fail to load", () => {
    render(
      <ConsoleProvider>
        <InstancesView
          instances={[]}
          loadError={{ code: "ServiceUnavailable", message: "Backend unavailable", requestId: "req-1" }}
        />
      </ConsoleProvider>,
    );
    expect(screen.queryByText("Operating normally")).toBeNull();
    expect(screen.queryByText("None")).toBeNull();
    expect(screen.getAllByText("Unavailable")).toHaveLength(4);
    expect(screen.queryByText(/Last updated/)).toBeNull();
  });
});
