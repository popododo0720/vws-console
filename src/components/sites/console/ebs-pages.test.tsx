import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSnapshotAction, createVolumeAction, deleteSnapshotsAction } from "@/app/actions/resources";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { CreateSnapshotView } from "@/components/sites/console/create-snapshot-view";
import { CreateVolumeView } from "@/components/sites/console/create-volume-view";
import { SnapshotsView } from "@/components/sites/console/snapshots-view";
import type { Snapshot, Volume } from "@/types/console";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/app/actions/resources", () => ({
  createSnapshotAction: vi.fn(),
  createVolumeAction: vi.fn(),
  deleteSnapshotsAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/storage/volumes",
  useSearchParams: () => new URLSearchParams(),
}));

const snapshot: Snapshot = {
  id: "snap-0123456789abcdef0",
  name: "",
  volumeId: "vol-0123456789abcdef0",
  sizeGiB: 20,
  description: "nightly",
  state: "completed",
  started: "",
  owner: "123456789012",
  region: "vws-1",
};

const volume: Volume = {
  id: "vol-0123456789abcdef0",
  name: "",
  state: "available",
  volumeType: "gp3",
  sizeGiB: 8,
  iops: 3000,
  throughput: "125",
  owner: "123456789012",
  snapshotId: "",
  sourceVolumeId: "",
  created: "2026-11-05T08:26:38Z",
  availabilityZone: "vws-1a",
  region: "vws-1",
  attachment: null,
};

const wrap = (ui: React.ReactNode) => render(<ConsoleProvider>{ui}</ConsoleProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe("Create volume", () => {
  const renderCreate = (initialSnapshotId = "") =>
    wrap(
      <CreateVolumeView
        snapshots={[snapshot]}
        snapshotsError={null}
        zones={["vws-1a"]}
        initialSnapshotId={initialSnapshotId}
      />,
    );

  it("shows the AWS defaults and sends them", async () => {
    vi.mocked(createVolumeAction).mockResolvedValue(null);
    renderCreate();
    expect(screen.getByLabelText("Volume type")).toHaveValue("gp3");
    expect(screen.getByLabelText("Size (GiB)")).toHaveValue("100");
    expect(screen.getByText("Min: 3000 IOPS, Max: 80000 IOPS.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create volume" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/storage/volumes"));
    expect(createVolumeAction).toHaveBeenCalledWith(
      { volumeType: "gp3", size: 100, iops: 3000, throughput: 125, availabilityZone: "vws-1a", snapshotId: null },
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
  });

  it("turns IOPS and throughput off for gp2", () => {
    renderCreate();
    fireEvent.change(screen.getByLabelText("Volume type"), { target: { value: "gp2" } });
    expect(screen.getByLabelText("IOPS")).toBeDisabled();
    expect(screen.getByLabelText("IOPS")).toHaveValue("300 / 3000");
    expect(screen.getByLabelText("Throughput (MiB/s)")).toHaveValue("Not applicable");
    expect(screen.getByText("Min: 1 GiB, Max: 16384 GiB.")).toBeInTheDocument();
  });

  it("refuses an out-of-range size in the form without calling the server", () => {
    renderCreate();
    fireEvent.change(screen.getByLabelText("Size (GiB)"), { target: { value: "70000" } });
    fireEvent.click(screen.getByRole("button", { name: "Create volume" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Size must be from 1 to 65536 GiB.");
    expect(createVolumeAction).not.toHaveBeenCalled();
  });

  it.each(["0x10", "1e2", "0b11", " 12", "12.0"])("refuses size %j as not a whole number", (value) => {
    renderCreate();
    fireEvent.change(screen.getByLabelText("Size (GiB)"), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Create volume" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Size must be a whole number.");
    expect(createVolumeAction).not.toHaveBeenCalled();
  });

  it("reuses the idempotency key on a retry and mints a new one when the form changes", async () => {
    vi.mocked(createVolumeAction).mockResolvedValue({ code: "RequestTimeout", message: "timed out", requestId: "r1" });
    renderCreate();
    const create = screen.getByRole("button", { name: "Create volume" });
    fireEvent.click(create);
    await screen.findByText("The volume could not be created");
    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.click(create);
    await waitFor(() => expect(createVolumeAction).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Size (GiB)"), { target: { value: "101" } });
    fireEvent.click(create);
    await waitFor(() => expect(createVolumeAction).toHaveBeenCalledTimes(3));
    const keys = vi.mocked(createVolumeAction).mock.calls.map((call) => call[1]);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("keeps the idempotency key across a reload and forgets it after a success", async () => {
    vi.mocked(createVolumeAction).mockResolvedValueOnce({ code: "RequestTimeout", message: "lost", requestId: null });
    const first = renderCreate();
    fireEvent.click(screen.getByRole("button", { name: "Create volume" }));
    await screen.findByText("The volume could not be created");
    first.unmount();

    vi.mocked(createVolumeAction).mockResolvedValue(null);
    const second = renderCreate();
    fireEvent.click(screen.getByRole("button", { name: "Create volume" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/storage/volumes"));
    second.unmount();

    renderCreate();
    fireEvent.click(screen.getByRole("button", { name: "Create volume" }));
    await waitFor(() => expect(createVolumeAction).toHaveBeenCalledTimes(3));
    const keys = vi.mocked(createVolumeAction).mock.calls.map((call) => call[1]);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("preselects a snapshot from the link and sizes the volume to it", () => {
    renderCreate(snapshot.id);
    expect(screen.getByLabelText(/Snapshot ID/)).toHaveValue(snapshot.id);
    expect(screen.getByLabelText("Size (GiB)")).toHaveValue("20");
  });

  it("shows encryption and tags as unavailable", () => {
    renderCreate();
    expect(screen.getByRole("checkbox", { name: "Encrypt this volume" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add new tag" })).toBeDisabled();
  });
});

describe("Create snapshot", () => {
  it("needs a volume, then sends it with the description", async () => {
    vi.mocked(createSnapshotAction).mockResolvedValue(null);
    wrap(<CreateSnapshotView volumes={[volume]} volumesError={null} initialVolumeId="" />);
    expect(screen.getByRole("radio", { name: /Instance/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Create snapshot" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a volume.");
    fireEvent.change(screen.getByLabelText("Volume ID"), { target: { value: volume.id } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "before upgrade" } });
    fireEvent.click(screen.getByRole("button", { name: "Create snapshot" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/storage/snapshots"));
    expect(createSnapshotAction).toHaveBeenCalledWith(
      { volumeId: volume.id, description: "before upgrade" },
      expect.any(String),
    );
  });

  it("ignores a volume ID from the link that is not in the list", () => {
    wrap(<CreateSnapshotView volumes={[volume]} volumesError={null} initialVolumeId="vol-<script>" />);
    expect(screen.getByLabelText("Volume ID")).toHaveValue("");
  });

  it("caps the description at 255 characters", () => {
    wrap(<CreateSnapshotView volumes={[volume]} volumesError={null} initialVolumeId={volume.id} />);
    expect(screen.getByLabelText("Description")).toHaveAttribute("maxLength", "255");
    expect(screen.getByText("255 characters maximum")).toBeInTheDocument();
  });
});

describe("Snapshots list", () => {
  it("shows the AWS empty state", () => {
    wrap(<SnapshotsView snapshots={[]} loadError={null} />);
    expect(screen.getByText("You currently have no snapshots in this Region.")).toBeInTheDocument();
    expect(screen.getByText("Select a snapshot above.")).toBeInTheDocument();
    expect(screen.getByText("Snapshot scope")).toBeInTheDocument();
  });

  it("asks before deleting and keeps the dialog open with the error on failure", async () => {
    vi.mocked(deleteSnapshotsAction).mockResolvedValue({
      code: "InvalidSnapshot.InUse",
      message: "in use",
      requestId: "r",
    });
    wrap(<SnapshotsView snapshots={[snapshot]} loadError={null} />);
    fireEvent.click(screen.getByRole("checkbox", { name: `Select ${snapshot.id}` }));
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete snapshot" }));
    expect(deleteSnapshotsAction).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Delete snapshot" });
    expect(dialog).toHaveTextContent(snapshot.id);
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await within(dialog).findByText("The snapshot could not be deleted");
    expect(deleteSnapshotsAction).toHaveBeenCalledWith([snapshot.id]);
    expect(router.refresh).toHaveBeenCalled();
  });

  it("links Create volume from snapshot to the create page", () => {
    wrap(<SnapshotsView snapshots={[snapshot]} loadError={null} />);
    fireEvent.click(screen.getByRole("checkbox", { name: `Select ${snapshot.id}` }));
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menuitem", { name: "Create volume from snapshot" })).toHaveAttribute(
      "href",
      `/storage/volumes/create?snapshotId=${snapshot.id}`,
    );
  });
});
