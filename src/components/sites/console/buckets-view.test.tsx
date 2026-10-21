import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { BucketsView } from "@/components/sites/console/buckets-view";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/storage/buckets",
  useSearchParams: () => new URLSearchParams(),
}));

function renderBuckets() {
  render(
    <ConsoleProvider>
      <BucketsView />
    </ConsoleProvider>,
  );
}

describe("BucketsView parity", () => {
  it("names the region column VWS Region", () => {
    renderBuckets();
    expect(screen.getByRole("columnheader", { name: /VWS Region/ })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: /^Region$/ })).toBeNull();
  });

  it("puts the only refresh button in the top row next to Copy ARN", () => {
    renderBuckets();
    const refreshButton = screen.getByRole("button", { name: "Refresh" });
    const copyArn = screen.getByRole("button", { name: "Copy ARN" });
    expect(screen.getAllByRole("button", { name: "Refresh" })).toHaveLength(1);
    expect(refreshButton.parentElement).toBe(copyArn.parentElement);
    expect(refreshButton.compareDocumentPosition(copyArn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(refreshButton);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("has no Info link beside the Directory buckets tab", () => {
    renderBuckets();
    const directoryTab = screen.getByRole("button", { name: "Directory buckets" });
    const tabs = directoryTab.parentElement as HTMLElement;
    expect(within(tabs).queryByRole("button", { name: /Info/ })).toBeNull();
    expect(within(tabs).queryByText("Info")).toBeNull();
  });

  it("shows the empty state for the general purpose tab", () => {
    renderBuckets();
    expect(screen.getByText("No buckets")).toBeTruthy();
    expect(screen.getByText("You don't have any buckets.")).toBeTruthy();
  });
});
