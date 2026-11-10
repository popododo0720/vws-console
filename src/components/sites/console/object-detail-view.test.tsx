import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseBucketName, type ApiError, type StoredObject } from "@/lib/vws-api/adapter";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { ObjectDetailView } from "@/components/sites/console/object-detail-view";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/storage/buckets/logs-1/object",
  useRouter: () => ({ push: nav.push, refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
const actions = vi.hoisted(() => ({ deleteObjectAction: vi.fn() }));
vi.mock("@/app/actions/resources", () => actions);
const downloads = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("@/lib/download", () => downloads);
const clipboard = vi.hoisted(() => ({ copyToClipboard: vi.fn() }));
vi.mock("@/lib/clipboard", () => clipboard);

const name = parseBucketName("logs-1");
if (!name) throw new Error("logs-1");
const bucket = { name, ownerId: "123456789012", created: "2026-08-02T00:00:00Z" };
const notes: StoredObject = {
  bucket: name,
  key: "docs/2026/notes.txt",
  size: 2048,
  contentType: "text/plain",
  lastModified: "2026-08-02T00:00:00Z",
  etag: "etag-1",
};

const alertFor = (code: string, message: string): ApiError => ({ code, message, requestId: "r-1" });

function renderView(props: Partial<Parameters<typeof ObjectDetailView>[0]> = {}) {
  render(
    <ConsoleProvider>
      <ObjectDetailView
        name="logs-1"
        objectKey="docs/2026/notes.txt"
        bucket={bucket}
        object={notes}
        loadError={null}
        {...props}
      />
    </ConsoleProvider>,
  );
}

describe("ObjectDetailView", () => {
  beforeEach(() => {
    nav.push.mockReset();
    actions.deleteObjectAction.mockReset();
    downloads.download.mockReset();
    downloads.download.mockResolvedValue(null);
    clipboard.copyToClipboard.mockReset();
    clipboard.copyToClipboard.mockResolvedValue(true);
  });

  it("shows the object overview", () => {
    renderView();
    expect(screen.getByRole("heading", { name: "Object overview" })).toBeTruthy();
    const fields = new Map(
      screen.getAllByText(/./, { selector: "dt" }).map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]),
    );
    expect(fields.get("Owner")).toBe("123456789012");
    expect(fields.get("Region")).toBe("vws-1");
    expect(fields.get("Last modified")).toBe("Aug 2, 2026, 12:00:00 AM UTC");
    expect(fields.get("Size")).toBe("2.0 KB");
    expect(fields.get("Type")).toBe("txt");
    expect(fields.get("Key")).toBe("docs/2026/notes.txt");
    expect(fields.get("S3 URI")).toBe("s3://logs-1/docs/2026/notes.txt");
    expect(fields.get("Amazon Resource Name (ARN)")).toBe("arn:aws:s3:::logs-1/docs/2026/notes.txt");
    expect(fields.get("Entity tag (Etag)")).toBe("etag-1");
    expect(fields.get("Object URL")).toBe("/storage/buckets/logs-1/object/download?prefix=docs%2F2026%2Fnotes.txt");
  });

  it("renders a key full of markup as text", () => {
    const key = "<img src=x onerror=alert(1)>.txt";
    renderView({ objectKey: key, object: { ...notes, key } });
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getAllByText(key).length).toBeGreaterThan(0);
  });

  it("disables the tabs and Open the backend cannot serve", () => {
    renderView();
    expect(screen.getByRole("button", { name: "Permissions" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Versions" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open" })).toBeDisabled();
  });

  it("says the object is not found, with a link back to the bucket", () => {
    renderView({ object: null });
    expect(screen.getByText("Object not found")).toBeTruthy();
    expect(screen.getByText("docs/2026/notes.txt is not in logs-1.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to bucket" })).toHaveAttribute("href", "/storage/buckets/logs-1");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says the bucket is not found", () => {
    renderView({ bucket: null, object: null });
    expect(screen.getByText("Bucket not found")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to buckets" })).toHaveAttribute("href", "/storage/buckets");
  });

  it("shows a load error instead of claiming the object is missing", () => {
    renderView({ object: null, loadError: alertFor("ServiceUnavailable", "The VWS console API did not answer.") });
    expect(screen.getByRole("alert")).toHaveTextContent("The object could not be loaded");
    expect(screen.getByRole("alert")).toHaveTextContent("The VWS console API did not answer.");
    expect(screen.queryByText("Object not found")).toBeNull();
  });

  it("shows a rejected key as an error", () => {
    renderView({
      objectKey: "",
      bucket: null,
      object: null,
      loadError: alertFor("InvalidArgument", "Exactly one prefix parameter naming the object key is required."),
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Exactly one prefix parameter");
  });

  it("copies the S3 URI", async () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Copy S3 URI" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy());
    expect(clipboard.copyToClipboard).toHaveBeenCalledWith("s3://logs-1/docs/2026/notes.txt", "object-detail");
  });

  it("reports a failed copy", async () => {
    clipboard.copyToClipboard.mockResolvedValue(false);
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Copy S3 URI" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy failed" })).toBeTruthy());
  });

  it("downloads through the route with the key's file name", async () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(downloads.download).toHaveBeenCalledTimes(1));
    expect(downloads.download).toHaveBeenCalledWith(
      "/storage/buckets/logs-1/object/download?prefix=docs%2F2026%2Fnotes.txt",
      "notes.txt",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a failed download and does not start a second one while the first runs", async () => {
    let finish!: (value: ApiError | null) => void;
    downloads.download.mockReturnValueOnce(new Promise((done) => (finish = done)));
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    finish(alertFor("NoSuchKey", "The specified key does not exist."));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The specified key does not exist."));
    expect(downloads.download).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
  });

  function openDeleteDialog() {
    fireEvent.click(screen.getByRole("button", { name: /Object actions/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    return screen.getByRole("dialog", { name: "Delete objects" });
  }

  it("deletes after the confirmation word and returns to the bucket", async () => {
    actions.deleteObjectAction.mockResolvedValue(null);
    renderView();
    const dialog = openDeleteDialog();
    const confirm = within(dialog).getByRole("button", { name: "Delete objects" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Confirm deletion" }), {
      target: { value: "permanently delete" },
    });
    fireEvent.click(confirm);
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/storage/buckets/logs-1"));
    expect(actions.deleteObjectAction).toHaveBeenCalledTimes(1);
    expect(actions.deleteObjectAction).toHaveBeenCalledWith("logs-1", "docs/2026/notes.txt");
  });

  it("stays on the page and shows the error when delete fails", async () => {
    actions.deleteObjectAction.mockResolvedValue(alertFor("AccessDenied", "Access Denied"));
    renderView();
    const dialog = openDeleteDialog();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Confirm deletion" }), {
      target: { value: "permanently delete" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete objects" }));
    await waitFor(() => expect(within(dialog).getByText("Access Denied")).toBeTruthy());
    expect(nav.push).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: "Delete objects" })).toBeDisabled();
  });

  it("does not delete without the exact confirmation word", () => {
    renderView();
    const dialog = openDeleteDialog();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Confirm deletion" }), {
      target: { value: "Permanently Delete" },
    });
    expect(within(dialog).getByRole("button", { name: "Delete objects" })).toBeDisabled();
    expect(actions.deleteObjectAction).not.toHaveBeenCalled();
  });
});
