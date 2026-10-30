import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseBucketName } from "@/lib/vws-api/adapter";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { BucketDetailView } from "@/components/sites/console/bucket-detail-view";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  search: "",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/storage/buckets/logs-1",
  useRouter: () => ({
    push: nav.push,
    refresh: nav.refresh,
    replace: (url: string) => {
      nav.replace(url);
      nav.search = url.includes("?") ? (url.split("?")[1] ?? "") : "";
    },
  }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));

function logsBucket() {
  const name = parseBucketName("logs-1");
  if (!name) throw new Error("logs-1");
  return { name, ownerId: "123", created: "2026-08-02T00:00:00Z" };
}

describe("BucketDetailView", () => {
  beforeEach(() => {
    nav.search = "";
  });

  it("opens an API bucket and does not list session objects", () => {
    render(
      <ConsoleProvider>
        <BucketDetailView name="logs-1" bucket={logsBucket()} loadError={null} />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /—/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Show sample data" }));
    expect(screen.queryByText("Bucket not found")).toBeNull();
    expect(screen.queryByText("vws-logs")).toBeNull();
    expect(screen.getByText("This console cannot list objects in this bucket.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "properties" }));
    expect(screen.getByText("Aug 2, 2026, 12:00:00 AM UTC")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows a load error instead of claiming the bucket is missing", () => {
    render(
      <ConsoleProvider>
        <BucketDetailView
          name="logs-1"
          bucket={null}
          loadError={{ code: "ServiceUnavailable", message: "The VWS console API did not answer.", requestId: null }}
        />
      </ConsoleProvider>,
    );
    expect(screen.getByText("The bucket could not be loaded")).toBeTruthy();
    expect(screen.queryByText("Bucket not found")).toBeNull();
  });
});
