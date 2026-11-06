import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteVolumesAction, detachVolumeAction } from "@/app/actions/resources";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { VolumesView } from "@/components/sites/console/volumes-view";
import type { ApiError } from "@/lib/vws-api/adapter";
import type { Volume } from "@/types/console";

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/app/actions/resources", () => ({
  detachVolumeAction: vi.fn(),
  createSnapshotAction: vi.fn(),
  createVolumeAction: vi.fn(),
  deleteVolumesAction: vi.fn(),
  modifyVolumeAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/storage/volumes",
  useSearchParams: () => new URLSearchParams(),
}));

function volume(id: string, state: string, attachment: Volume["attachment"]): Volume {
  return {
    id,
    name: "",
    state,
    volumeType: "gp3",
    sizeGiB: 8,
    iops: null,
    throughput: "",
    owner: "",
    snapshotId: "",
    sourceVolumeId: "",
    created: "",
    availabilityZone: "vws-1a",
    region: "vws-1",
    attachment,
  };
}

function renderVolumes(rows: Volume[]) {
  render(
    <ConsoleProvider>
      <VolumesView volumes={rows} loadError={null} loadedAt="2026-11-05T08:26:38.000Z" />
    </ConsoleProvider>,
  );
}

function openActions() {
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
}

describe("VolumesView attach and detach", () => {
  beforeEach(() => {
    vi.mocked(detachVolumeAction).mockReset();
    vi.mocked(detachVolumeAction).mockResolvedValue(null);
  });

  it("shows Attach volume and Detach volume in the actions menu", () => {
    renderVolumes([volume("vol-1", "available", null)]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    openActions();
    expect(screen.getByRole("menuitem", { name: "Attach volume" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Detach volume" })).toBeTruthy();
  });

  it("enables Attach for one available volume and disables Detach", () => {
    renderVolumes([volume("vol-1", "available", null)]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    openActions();
    expect(screen.getByRole("menuitem", { name: "Attach volume" })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: "Detach volume" })).toBeDisabled();
  });

  it("enables Detach for one in-use volume and disables Attach", () => {
    renderVolumes([volume("vol-1", "in-use", { instanceId: "i-1", device: "/dev/sdf" })]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    openActions();
    expect(screen.getByRole("menuitem", { name: "Attach volume" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Detach volume" })).toBeEnabled();
  });

  it("disables both actions when two volumes are selected", () => {
    renderVolumes([
      volume("vol-1", "available", null),
      volume("vol-2", "in-use", { instanceId: "i-1", device: "/dev/sdf" }),
    ]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-2" }));
    openActions();
    expect(screen.getByRole("menuitem", { name: "Attach volume" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Detach volume" })).toBeDisabled();
  });

  it("disables both actions when the volume is creating", () => {
    renderVolumes([volume("vol-1", "creating", null)]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    openActions();
    expect(screen.getByRole("menuitem", { name: "Attach volume" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Detach volume" })).toBeDisabled();
  });

  it("links Attach volume to the attach page for one available volume", () => {
    renderVolumes([volume("vol-1", "available", null)]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    openActions();
    expect(screen.getByRole("menuitem", { name: "Attach volume" })).toHaveAttribute(
      "href",
      "/storage/volumes/vol-1/attach",
    );
  });

  it("does not link Attach volume for an in-use or unselected volume", () => {
    renderVolumes([volume("vol-1", "in-use", { instanceId: "i-1", device: "/dev/sdf" })]);
    openActions();
    expect(screen.getByRole("menuitem", { name: "Attach volume" })).not.toHaveAttribute("href");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    expect(screen.getByRole("menuitem", { name: "Attach volume" })).not.toHaveAttribute("href");
  });

  it("detaches an in-use volume from its instance", () => {
    renderVolumes([volume("vol-1", "in-use", { instanceId: "i-1", device: "/dev/sdf" })]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    openActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Detach volume" }));
    const dialog = screen.getByRole("dialog", { name: "Detach volume" });
    expect(dialog).toHaveTextContent("Are you sure that you want to detach the following volume?");
    expect(dialog).toHaveTextContent("vol-1");
    expect(dialog).toHaveTextContent("from instance i-1 (/dev/sdf)");
    fireEvent.click(screen.getByRole("button", { name: "Detach" }));
    expect(detachVolumeAction).toHaveBeenCalledWith("vol-1");
    expect(detachVolumeAction).toHaveBeenCalledTimes(1);
  });

  it("keeps the detach dialog open with an error, and a reopened dialog starts clean", async () => {
    const error: ApiError = { code: "Conflict", message: "Volume vol-1 is busy.", requestId: "req-1" };
    vi.mocked(detachVolumeAction).mockResolvedValue(error);
    renderVolumes([volume("vol-1", "in-use", { instanceId: "i-1", device: "/dev/sdf" })]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    openActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Detach volume" }));
    fireEvent.click(screen.getByRole("button", { name: "Detach" }));
    const dialog = screen.getByRole("dialog", { name: "Detach volume" });
    expect(await within(dialog).findByText("The volume could not be detached")).toBeTruthy();
    expect(within(dialog).getByText("Volume vol-1 is busy.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    openActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Detach volume" }));
    expect(screen.queryByText("Volume vol-1 is busy.")).toBeNull();
  });

  it("sends one detach request on a double click", () => {
    renderVolumes([volume("vol-1", "in-use", { instanceId: "i-1", device: "/dev/sdf" })]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    openActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Detach volume" }));
    const button = screen.getByRole("button", { name: "Detach" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(detachVolumeAction).toHaveBeenCalledTimes(1);
  });

  it("matches the AWS column order and empty state", () => {
    renderVolumes([]);
    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent?.trim());
    expect(headers.slice(1)).toEqual([
      "Name",
      "Volume ID",
      "Type",
      "Size",
      "IOPS",
      "Throughput",
      "Owner ID",
      "Snapshot ID",
      "Source volume ID",
      "Created",
      "Availability Zone",
      "Volume state",
      "Attached resources",
    ]);
    expect(screen.getByText("You currently have no volumes in this region")).toBeInTheDocument();
    expect(screen.getByText("Fault tolerance for all volumes in this Region")).toBeInTheDocument();
    expect(screen.getByText(/Last updated on Thu, Nov 5, 2026, 8:26:38 AM \(GMT\+00:00\)/)).toBeInTheDocument();
  });

  it("asks before deleting a volume", () => {
    renderVolumes([volume("vol-1", "available", null)]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    openActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete volume" }));
    expect(deleteVolumesAction).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Delete volume" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(deleteVolumesAction).toHaveBeenCalledWith(["vol-1"]);
  });

  it("opens Create snapshot with the selected volume", () => {
    renderVolumes([volume("vol-1", "available", null)]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    openActions();
    expect(screen.getByRole("menuitem", { name: "Create snapshot" })).toHaveAttribute(
      "href",
      "/storage/snapshots/create?volumeId=vol-1",
    );
  });
});
