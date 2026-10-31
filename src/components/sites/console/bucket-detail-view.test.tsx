import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const actions = vi.hoisted(() => ({ getObjectAction: vi.fn(), deleteObjectAction: vi.fn() }));
vi.mock("@/app/actions/resources", () => actions);

const notes = {
  bucket: "logs-1",
  key: "docs/notes.txt",
  size: 2048,
  contentType: "text/plain",
  lastModified: "2026-08-02T00:00:00Z",
  etag: "e1",
  bytes: new Uint8Array([104, 105]),
};

function renderDetail() {
  render(
    <ConsoleProvider>
      <BucketDetailView name="logs-1" bucket={logsBucket()} loadError={null} />
    </ConsoleProvider>,
  );
}

function find(key: string) {
  const box = screen.getByRole("searchbox", { name: "Find objects by key" });
  fireEvent.change(box, { target: { value: key } });
  fireEvent.submit(screen.getByRole("search"));
}

function logsBucket() {
  const name = parseBucketName("logs-1");
  if (!name) throw new Error("logs-1");
  return { name, ownerId: "123", created: "2026-08-02T00:00:00Z" };
}

describe("BucketDetailView", () => {
  beforeEach(() => {
    nav.search = "";
    actions.getObjectAction.mockReset();
    actions.deleteObjectAction.mockReset();
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
    expect(
      screen.getByText("This console cannot list objects in this bucket. Find an object by its key."),
    ).toBeTruthy();
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

  it("finds an object by key through console-api and shows its row", async () => {
    actions.getObjectAction.mockResolvedValue({ ok: true, value: notes });
    renderDetail();
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
    find("docs/notes.txt");
    await waitFor(() => expect(screen.getByText("docs/notes.txt")).toBeTruthy());
    expect(actions.getObjectAction).toHaveBeenCalledWith("logs-1", "docs/notes.txt");
    expect(screen.getByText("txt")).toBeTruthy();
    expect(screen.getByText("2.0 KB")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Objects/ })).toHaveTextContent("(1)");
  });

  it("says no object matched a missing key", async () => {
    actions.getObjectAction.mockResolvedValue({ ok: true, value: null });
    renderDetail();
    find("gone.txt");
    await waitFor(() => expect(screen.getByText("No object has the key gone.txt.")).toBeTruthy());
  });

  it("shows NoSuchBucket from a lookup as an error", async () => {
    actions.getObjectAction.mockResolvedValue({
      ok: false,
      error: { code: "NoSuchBucket", message: "The specified bucket does not exist.", requestId: "r-6" },
    });
    renderDetail();
    find("a.txt");
    await waitFor(() => expect(screen.getByText("The object action failed")).toBeTruthy());
    expect(screen.getByText("The specified bucket does not exist.")).toBeTruthy();
    expect(screen.getByText(/NoSuchBucket/)).toBeTruthy();
  });

  it("downloads the selected object with its key's file name", async () => {
    actions.getObjectAction.mockResolvedValue({ ok: true, value: notes });
    const created: Blob[] = [];
    const clicked: string[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return "blob:x";
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });
    renderDetail();
    find("docs/notes.txt");
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Select docs/notes.txt" })).toBeTruthy());
    fireEvent.click(screen.getByRole("checkbox", { name: "Select docs/notes.txt" }));
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(clicked).toEqual(["notes.txt"]);
    expect(created[0].type).toBe("text/plain");
    expect(new Uint8Array(await created[0].arrayBuffer())).toEqual(new Uint8Array([104, 105]));
    click.mockRestore();
  });

  it("deletes the selected object after typing permanently delete", async () => {
    actions.getObjectAction.mockResolvedValue({ ok: true, value: notes });
    actions.deleteObjectAction.mockResolvedValue(null);
    renderDetail();
    find("docs/notes.txt");
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Select docs/notes.txt" })).toBeTruthy());
    fireEvent.click(screen.getByRole("checkbox", { name: "Select docs/notes.txt" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete objects" });
    const confirm = within(dialog).getByRole("button", { name: "Delete objects" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Confirm deletion" }), {
      target: { value: "permanently delete" },
    });
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Delete objects" })).toBeNull());
    expect(actions.deleteObjectAction).toHaveBeenCalledTimes(1);
    expect(actions.deleteObjectAction).toHaveBeenCalledWith("logs-1", "docs/notes.txt");
    expect(screen.getByRole("status")).toHaveTextContent("Successfully deleted docs/notes.txt.");
    expect(screen.queryByText("2.0 KB")).toBeNull();
  });

  it("keeps the dialog and the object when delete fails", async () => {
    actions.getObjectAction.mockResolvedValue({ ok: true, value: notes });
    actions.deleteObjectAction.mockResolvedValue({
      code: "AccessDenied",
      message: "Access Denied",
      requestId: "r-1",
    });
    renderDetail();
    find("docs/notes.txt");
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Select docs/notes.txt" })).toBeTruthy());
    fireEvent.click(screen.getByRole("checkbox", { name: "Select docs/notes.txt" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete objects" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Confirm deletion" }), {
      target: { value: "permanently delete" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete objects" }));
    await waitFor(() => expect(within(dialog).getByText("Access Denied")).toBeTruthy());
    expect(screen.getByRole("dialog", { name: "Delete objects" })).toBeTruthy();
    expect(screen.getByText("2.0 KB")).toBeTruthy();
  });
});
