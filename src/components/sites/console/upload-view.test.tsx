import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseBucketName, type ApiError } from "@/lib/vws-api/adapter";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { UploadView } from "@/components/sites/console/upload-view";

const { push, uploadObjectAction } = vi.hoisted(() => ({ push: vi.fn(), uploadObjectAction: vi.fn() }));

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/app/actions/resources", () => ({ uploadObjectAction }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/storage/buckets/vws-logs/upload",
  useSearchParams: () => new URLSearchParams(),
}));

const name = parseBucketName("vws-logs");
if (!name) throw new Error("vws-logs");
const bucket = { name, ownerId: "123", created: "2026-08-02T00:00:00Z" };

function file(value: string) {
  return new File(["content"], value, { type: "text/plain" });
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

function renderView() {
  render(
    <ConsoleProvider>
      <UploadView name="vws-logs" bucket={bucket} loadError={null} />
    </ConsoleProvider>,
  );
}

describe("UploadView", () => {
  beforeEach(() => {
    push.mockReset();
    uploadObjectAction.mockReset();
    uploadObjectAction.mockResolvedValue(null);
  });

  it("keeps a file added while the upload is in progress", async () => {
    const pending = deferred();
    uploadObjectAction.mockReturnValueOnce(pending.promise);
    renderView();

    addFiles(file("first.txt"));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    addFiles(file("late.txt"));

    expect(screen.getByText("late.txt")).toBeInTheDocument();
    await act(async () => {
      pending.resolve(null);
      await pending.promise;
    });

    await waitFor(() => expect(screen.queryByText("first.txt")).not.toBeInTheDocument());
    expect(screen.getByText("late.txt")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("returns to the bucket after the last queued file uploads", async () => {
    renderView();

    addFiles(file("first.txt"));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/storage/buckets/vws-logs"));
    expect(screen.queryByText("first.txt")).not.toBeInTheDocument();
  });

  it("keeps the batch listed when the upload fails", async () => {
    uploadObjectAction.mockResolvedValueOnce({ code: "AccessDenied", message: "Access Denied", requestId: "r-1" });
    renderView();

    addFiles(file("first.txt"));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled());
    expect(screen.getByText("first.txt")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a transport failure and keeps the file selected", async () => {
    uploadObjectAction.mockRejectedValueOnce(new Error("Body exceeded 1 MB limit"));
    renderView();

    addFiles(file("notes.txt"));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText("The upload could not be sent.")).toBeTruthy();
    expect(screen.getByText("notes.txt")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the backend message when the upload is rejected", async () => {
    uploadObjectAction.mockResolvedValueOnce({ code: "AccessDenied", message: "Access Denied", requestId: "r-1" });
    renderView();

    addFiles(file("first.txt"));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Upload failed");
    expect(alert).toHaveTextContent("Access Denied");
    expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });
});
