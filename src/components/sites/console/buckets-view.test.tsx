import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseBucketName, type ApiError } from "@/lib/vws-api/adapter";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { BucketsView } from "@/components/sites/console/buckets-view";
import { CreateBucketView } from "@/components/sites/console/create-bucket-view";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  search: "",
}));

const actions = vi.hoisted(() => ({
  createBucketAction: vi.fn(async () => null as ApiError | null),
  deleteBucketsAction: vi.fn(async () => null as ApiError | null),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/storage/buckets",
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
vi.mock("@/app/actions/resources", () => ({
  createBucketAction: actions.createBucketAction,
  deleteBucketsAction: actions.deleteBucketsAction,
}));

function logsBucket() {
  const name = parseBucketName("logs-1");
  if (!name) throw new Error("logs-1");
  return { name, ownerId: "123", created: "2026-08-02T00:00:00Z" };
}

function showSampleData() {
  fireEvent.click(screen.getByRole("button", { name: /—/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Show sample data" }));
}

describe("BucketsView", () => {
  beforeEach(() => {
    nav.search = "";
    nav.push.mockReset();
    nav.replace.mockReset();
    nav.refresh.mockReset();
    actions.createBucketAction.mockReset();
    actions.createBucketAction.mockResolvedValue(null);
    actions.deleteBucketsAction.mockReset();
    actions.deleteBucketsAction.mockResolvedValue(null);
  });

  it("lists API buckets and leaves the sample buckets in the provider only", () => {
    render(
      <ConsoleProvider>
        <BucketsView buckets={[logsBucket()]} loadError={null} />
      </ConsoleProvider>,
    );
    showSampleData();
    expect(screen.getByRole("link", { name: "logs-1" })).toBeTruthy();
    expect(screen.getByText("2026-08-02T00:00:00Z")).toBeTruthy();
    expect(screen.queryByText("vws-logs")).toBeNull();
    expect(screen.queryByText("vws-media")).toBeNull();
    const row = screen.getByRole("link", { name: "logs-1" }).closest("tr");
    expect(row?.textContent).toContain("\u2014");
    expect(screen.getByRole("heading", { name: /General purpose buckets/ })).toHaveTextContent("(1)");
    fireEvent.click(screen.getByRole("button", { name: "Account snapshot" }));
    fireEvent.click(screen.getByRole("button", { name: "View dashboard" }));
    const bucketCount = screen.getAllByRole("term").find((term) => term.textContent === "Buckets");
    expect(bucketCount?.nextElementSibling).toHaveTextContent("1");
  });

  it("shows a load error and the empty title when the API returns no buckets", () => {
    render(
      <ConsoleProvider>
        <BucketsView
          buckets={[]}
          loadError={{ code: "ServiceUnavailable", message: "The VWS console API did not answer.", requestId: null }}
        />
      </ConsoleProvider>,
    );
    expect(screen.getByText("Buckets could not be loaded")).toBeTruthy();
    expect(screen.getByText("The VWS console API did not answer.")).toBeTruthy();
    expect(screen.getByText("No buckets")).toBeTruthy();
  });

  it("shows an empty directory list and hides the API bucket", () => {
    render(
      <ConsoleProvider>
        <BucketsView buckets={[logsBucket()]} loadError={null} />
      </ConsoleProvider>,
    );
    expect(screen.getByRole("link", { name: "logs-1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Directory buckets" }));
    expect(screen.getByText("You don't have any directory buckets.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "logs-1" })).toBeNull();
  });

  it("keeps the bucket when emptying and does not call delete", () => {
    render(
      <ConsoleProvider>
        <BucketsView buckets={[logsBucket()]} loadError={null} />
      </ConsoleProvider>,
    );
    showSampleData();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select logs-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Empty" }));
    const dialog = screen.getByRole("dialog", { name: "Empty bucket" });
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "permanently delete" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Empty" }));
    expect(screen.getByText("Objects cannot be deleted from this console yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "logs-1" })).toBeTruthy();
    expect(actions.deleteBucketsAction).not.toHaveBeenCalled();
  });

  it("deletes the selected bucket through the server action", async () => {
    render(
      <ConsoleProvider>
        <BucketsView buckets={[logsBucket()]} loadError={null} />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Select logs-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete bucket" });
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "logs-1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete bucket" }));
    await waitFor(() => expect(actions.deleteBucketsAction).toHaveBeenCalledWith(["logs-1"]));
  });
});

describe("CreateBucketView", () => {
  beforeEach(() => {
    nav.push.mockReset();
    actions.createBucketAction.mockReset();
    actions.createBucketAction.mockResolvedValue(null);
  });

  it("refuses a directory bucket without calling the action", () => {
    render(
      <ConsoleProvider>
        <CreateBucketView />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Directory/ }));
    fireEvent.change(screen.getByPlaceholderText("my-bucket"), { target: { value: "logs-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create bucket" }));
    expect(screen.getByText("Directory buckets are not available.")).toBeTruthy();
    expect(actions.createBucketAction).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("navigates to the bucket list when the action accepts the name", async () => {
    render(
      <ConsoleProvider>
        <CreateBucketView />
      </ConsoleProvider>,
    );
    fireEvent.change(screen.getByPlaceholderText("my-bucket"), { target: { value: "logs-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create bucket" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/storage/buckets"));
    expect(actions.createBucketAction).toHaveBeenCalledWith("logs-1");
  });
});
