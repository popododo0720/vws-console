import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UploadView } from "@/components/sites/console/upload-view";

const { push, addObjects } = vi.hoisted(() => ({ push: vi.fn(), addObjects: vi.fn() }));

vi.mock("@/components/sites/console/console-provider", () => ({
  useConsole: () => ({
    account: { name: "—", id: "—" },
    signIn: false,
    regions: ["us-east-1"],
    region: "us-east-1",
    setRegion: vi.fn(),
    mode: "sample",
    showEmpty: vi.fn(),
    showSample: vi.fn(),
    density: "comfortable",
    setDensity: vi.fn(),
    instances: [],
    volumes: [],
    vpcs: [],
    subnets: [],
    routeTables: [],
    internetGateways: [],
    buckets: [
      {
        name: "vws-logs",
        region: "us-east-1",
        created: "Just now",
        kind: "general",
        versioning: false,
        blockPublicAccess: true,
      },
    ],
    objects: [],
    createRouteTable: vi.fn(),
    deleteRouteTables: vi.fn(),
    addRoute: vi.fn(),
    associateSubnet: vi.fn(),
    createInternetGateway: vi.fn(),
    attachInternetGateway: vi.fn(),
    detachInternetGateway: vi.fn(),
    deleteInternetGateways: vi.fn(),
    createBucket: vi.fn(),
    deleteBuckets: vi.fn(),
    emptyBucket: vi.fn(),
    addObjects,
    createFolder: vi.fn(),
    deleteObjects: vi.fn(),
  }),
}));

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/storage/buckets/vws-logs/upload",
  useSearchParams: () => new URLSearchParams(),
}));

function file(name: string) {
  return new File(["content"], name, { type: "text/plain" });
}

function addFiles(...files: File[]) {
  fireEvent.change(screen.getByLabelText("Add files"), { target: { files } });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("UploadView", () => {
  beforeEach(() => {
    push.mockReset();
    addObjects.mockReset();
    addObjects.mockResolvedValue(undefined);
  });

  it("keeps a file added while the upload is in progress", async () => {
    const pending = deferred();
    addObjects.mockReturnValueOnce(pending.promise);
    render(<UploadView name="vws-logs" />);

    addFiles(file("first.txt"));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    addFiles(file("late.txt"));

    expect(screen.getByText("late.txt")).toBeInTheDocument();
    await act(async () => {
      pending.resolve();
      await pending.promise;
    });

    await waitFor(() => expect(screen.queryByText("first.txt")).not.toBeInTheDocument());
    expect(screen.getByText("late.txt")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("returns to the bucket after the last queued file uploads", async () => {
    render(<UploadView name="vws-logs" />);

    addFiles(file("first.txt"));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/storage/buckets/vws-logs"));
    expect(screen.queryByText("first.txt")).not.toBeInTheDocument();
  });

  it("keeps the batch listed when the upload fails", async () => {
    addObjects.mockRejectedValueOnce(new Error("upload failed"));
    render(<UploadView name="vws-logs" />);

    addFiles(file("first.txt"));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled());
    expect(screen.getByText("first.txt")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the backend message when the upload is rejected", async () => {
    addObjects.mockRejectedValueOnce(new Error("Access Denied"));
    render(<UploadView name="vws-logs" />);

    addFiles(file("first.txt"));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Upload failed");
    expect(alert).toHaveTextContent("Access Denied");
    expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/storage/buckets/vws-logs"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
