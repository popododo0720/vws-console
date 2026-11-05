import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseBucketName, type ApiError } from "@/lib/vws-api/adapter";
import { MAX_OBJECT_BYTES } from "@/lib/object-upload";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { UploadView } from "@/components/sites/console/upload-view";

const nav = vi.hoisted(() => ({ search: "", push: vi.fn() }));
const { uploadObjectAction } = vi.hoisted(() => ({ uploadObjectAction: vi.fn() }));

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/app/actions/resources", () => ({ uploadObjectAction }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/storage/buckets/vws-logs/upload",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const name = parseBucketName("vws-logs");
if (!name) throw new Error("vws-logs");
const bucket = { name, ownerId: "123", created: "2026-08-02T00:00:00Z" };
const denied: ApiError = { code: "AccessDenied", message: "Access Denied", requestId: "r-1" };

function file(value: string, size = 7) {
  return new File([new Uint8Array(size)], value, { type: "text/plain" });
}

function oversize(value: string) {
  const big = file(value, 1);
  Object.defineProperty(big, "size", { value: MAX_OBJECT_BYTES + 1 });
  return big;
}

function addFiles(...files: File[]) {
  fireEvent.change(screen.getByLabelText("Add files"), { target: { files } });
}

function deferred() {
  let resolve!: (value: ApiError | null) => void;
  const promise = new Promise<ApiError | null>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const uploadButton = () => screen.getByRole("button", { name: /^(Upload|Retry)$/ });
const rowOf = (fileName: string) => screen.getByText(fileName).closest("tr") as HTMLElement;
const sentKeys = () => uploadObjectAction.mock.calls.map(([, form]) => (form as FormData).get("key"));

function renderView() {
  return render(
    <ConsoleProvider>
      <UploadView name="vws-logs" bucket={bucket} loadError={null} />
    </ConsoleProvider>,
  );
}

describe("UploadView", () => {
  beforeEach(() => {
    nav.search = "";
    nav.push.mockReset();
    uploadObjectAction.mockReset();
    uploadObjectAction.mockResolvedValue(null);
  });

  it("shows each file as pending until it is sent", () => {
    renderView();
    addFiles(file("a.txt"), file("b.txt"));
    expect(within(rowOf("a.txt")).getByText("Pending")).toBeTruthy();
    expect(within(rowOf("b.txt")).getByText("Pending")).toBeTruthy();
    expect(screen.queryByText("Upload: status")).toBeNull();
    expect(uploadButton()).toBeEnabled();
  });

  it("uploads in order, marks each succeeded, summarises, and does not leave the page", async () => {
    renderView();
    addFiles(file("a.txt"), file("b.txt"));
    fireEvent.click(uploadButton());

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Upload succeeded"));
    expect(sentKeys()).toEqual(["a.txt", "b.txt"]);
    expect(screen.getByText("Upload: status")).toBeTruthy();
    expect(within(rowOf("a.txt")).getByText("Succeeded")).toBeTruthy();
    expect(within(rowOf("b.txt")).getByText("Succeeded")).toBeTruthy();
    const counts = Object.fromEntries(
      screen.getAllByText(/./, { selector: "dt" }).map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]),
    );
    expect(counts).toEqual({ Succeeded: "2", Failed: "0", Waiting: "0" });
    expect(nav.push).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "a.txt" })).toHaveAttribute(
      "href",
      "/storage/buckets/vws-logs/object?prefix=a.txt",
    );
    expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute("href", "/storage/buckets/vws-logs");
    expect(uploadButton()).toBeDisabled();
    expect(screen.queryByLabelText("Add files")).toBeNull();
  });

  it("goes on after a failure, shows that file's error, and counts both outcomes", async () => {
    uploadObjectAction.mockResolvedValueOnce(denied);
    renderView();
    addFiles(file("a.txt"), file("b.txt"));
    fireEvent.click(uploadButton());

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Upload failed"));
    expect(sentKeys()).toEqual(["a.txt", "b.txt"]);
    const failed = rowOf("a.txt");
    expect(within(failed).getByText("Failed")).toBeTruthy();
    expect(within(failed).getByText("Access Denied")).toBeTruthy();
    expect(within(failed).getByText(/AccessDenied · Request ID r-1/)).toBeTruthy();
    expect(within(rowOf("b.txt")).getByText("Succeeded")).toBeTruthy();
    const counts = Object.fromEntries(
      screen.getAllByText(/./, { selector: "dt" }).map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]),
    );
    expect(counts).toMatchObject({ Succeeded: "1", Failed: "1" });
  });

  it("retries only the failed file and keeps the succeeded one untouched", async () => {
    uploadObjectAction.mockResolvedValueOnce(denied);
    renderView();
    addFiles(file("a.txt"), file("b.txt"));
    fireEvent.click(uploadButton());
    await waitFor(() => expect(uploadButton()).toHaveTextContent("Retry"));
    expect(uploadButton()).toBeEnabled();

    fireEvent.click(uploadButton());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Upload succeeded"));
    expect(sentKeys()).toEqual(["a.txt", "b.txt", "a.txt"]);
    expect(within(rowOf("a.txt")).getByText("Succeeded")).toBeTruthy();
  });

  it("sends nothing twice when Upload is clicked again before the first file settles", async () => {
    const first = deferred();
    uploadObjectAction.mockReturnValueOnce(first.promise);
    renderView();
    addFiles(file("a.txt"), file("b.txt"));
    const button = uploadButton();
    act(() => {
      button.click();
      button.click();
    });
    expect(within(rowOf("a.txt")).getByText("Uploading")).toBeTruthy();
    expect(uploadButton()).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Upload in progress");

    await act(async () => {
      first.resolve(null);
      await first.promise;
    });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Upload succeeded"));
    expect(sentKeys()).toEqual(["a.txt", "b.txt"]);
  });

  it("keeps a file added mid-run pending and sends it on the next click", async () => {
    const first = deferred();
    uploadObjectAction.mockReturnValueOnce(first.promise);
    renderView();
    addFiles(file("first.txt"));
    fireEvent.click(uploadButton());
    addFiles(file("late.txt"));
    expect(within(rowOf("late.txt")).getByText("Pending")).toBeTruthy();

    await act(async () => {
      first.resolve(null);
      await first.promise;
    });
    await waitFor(() => expect(uploadButton()).toBeEnabled());
    expect(sentKeys()).toEqual(["first.txt"]);
    expect(within(rowOf("late.txt")).getByText("Pending")).toBeTruthy();
    expect(screen.queryByLabelText("Add files")).toBeTruthy();

    fireEvent.click(uploadButton());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Upload succeeded"));
    expect(sentKeys()).toEqual(["first.txt", "late.txt"]);
  });

  it("marks an oversize file failed without sending it and cannot retry it", async () => {
    renderView();
    addFiles(oversize("big.bin"), file("ok.txt"));
    expect(within(rowOf("big.bin")).getByText("Objects larger than 4 MiB cannot be uploaded.")).toBeTruthy();
    fireEvent.click(uploadButton());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Upload failed"));
    expect(sentKeys()).toEqual(["ok.txt"]);
    expect(uploadButton()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Remove big.bin" }));
    expect(screen.queryByText("big.bin")).toBeNull();
  });

  it("skips a name already in the list and says so", () => {
    renderView();
    addFiles(file("a.txt"));
    addFiles(file("a.txt"), file("b.txt"), file("b.txt"));
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText(/Skipped 2 files already in the list/)).toHaveTextContent("a.txt, b.txt");
  });

  it("shows a thrown action as that file's failure and continues", async () => {
    uploadObjectAction.mockRejectedValueOnce(new Error("Body exceeded 1 MB limit"));
    renderView();
    addFiles(file("a.txt"), file("b.txt"));
    fireEvent.click(uploadButton());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Upload failed"));
    expect(within(rowOf("a.txt")).getByText("The upload could not be sent.")).toBeTruthy();
    expect(within(rowOf("b.txt")).getByText("Succeeded")).toBeTruthy();
  });

  it("prefixes keys with the destination prefix and returns Close to it", async () => {
    nav.search = "prefix=docs%2F2026%2F";
    renderView();
    addFiles(file("a.txt"));
    fireEvent.click(uploadButton());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Upload succeeded"));
    expect(sentKeys()).toEqual(["docs/2026/a.txt"]);
    expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute(
      "href",
      "/storage/buckets/vws-logs?prefix=docs%2F2026%2F",
    );
  });

  it("fails every file for a hostile prefix without calling the server", async () => {
    nav.search = "prefix=..%2F";
    renderView();
    addFiles(file("a.txt"));
    expect(uploadButton()).toBeDisabled();
    expect(within(rowOf("a.txt")).getByText("Failed")).toBeTruthy();
    expect(uploadObjectAction).not.toHaveBeenCalled();
  });

  it("lets a pending file be removed before the run, but not during it", async () => {
    const first = deferred();
    uploadObjectAction.mockReturnValueOnce(first.promise);
    renderView();
    addFiles(file("a.txt"), file("b.txt"));
    fireEvent.click(screen.getByRole("button", { name: "Remove b.txt" }));
    expect(screen.queryByText("b.txt")).toBeNull();
    addFiles(file("c.txt"));
    fireEvent.click(uploadButton());
    expect(screen.getByRole("button", { name: "Remove c.txt" })).toBeDisabled();
    await act(async () => {
      first.resolve(null);
      await first.promise;
    });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Upload succeeded"));
    expect(sentKeys()).toEqual(["a.txt", "c.txt"]);
  });

  it("starts no further file after the page is left", async () => {
    const first = deferred();
    uploadObjectAction.mockReturnValueOnce(first.promise);
    const view = renderView();
    addFiles(file("a.txt"), file("b.txt"));
    fireEvent.click(uploadButton());
    view.unmount();
    await act(async () => {
      first.resolve(null);
      await first.promise;
    });
    expect(sentKeys()).toEqual(["a.txt"]);
  });

  it("shows the load error or a missing bucket instead of the form", () => {
    const { unmount } = render(
      <ConsoleProvider>
        <UploadView name="vws-logs" bucket={null} loadError={denied} />
      </ConsoleProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("The bucket could not be loaded");
    unmount();
    render(
      <ConsoleProvider>
        <UploadView name="vws-logs" bucket={null} loadError={null} />
      </ConsoleProvider>,
    );
    expect(screen.getByText("Bucket not found")).toBeTruthy();
    expect(screen.queryByLabelText("Add files")).toBeNull();
  });
});
