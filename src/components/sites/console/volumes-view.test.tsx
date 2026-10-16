import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachVolumeAction, detachVolumeAction } from "@/app/actions/resources";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { VolumesView } from "@/components/sites/console/volumes-view";
import type { ApiError } from "@/lib/vws-api/adapter";
import type { Instance, Volume } from "@/types/console";

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/app/actions/resources", () => ({
  attachVolumeAction: vi.fn(),
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

const instances: Pick<Instance, "id" | "name" | "state" | "availabilityZone">[] = [
  { id: "i-pending", name: "boot", state: "pending", availabilityZone: "vws-1a" },
  { id: "i-1", name: "web", state: "running", availabilityZone: "vws-1a" },
  { id: "i-stop", name: "", state: "stopped", availabilityZone: "vws-1a" },
  { id: "i-2", name: "other", state: "running", availabilityZone: "vws-1b" },
];

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

function renderVolumes(rows: Volume[], rowsInstances = instances) {
  render(
    <ConsoleProvider>
      <VolumesView volumes={rows} loadError={null} instances={rowsInstances} instanceLoadError={null} />
    </ConsoleProvider>,
  );
}

function openActions() {
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
}

describe("VolumesView attach and detach", () => {
  beforeEach(() => {
    vi.mocked(attachVolumeAction).mockReset();
    vi.mocked(attachVolumeAction).mockResolvedValue(null);
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

  it("opens Attach volume with the running instances and /dev/sdf", () => {
    renderVolumes([volume("vol-1", "available", null)]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    openActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Attach volume" }));
    const dialog = screen.getByRole("dialog", { name: "Attach volume" });
    expect(within(dialog).getByRole("combobox", { name: "Instance" })).toBeTruthy();
    expect(within(dialog).getByRole("option", { name: "web (i-1)" })).toBeTruthy();
    expect(within(dialog).getByRole("option", { name: "i-stop" })).toBeTruthy();
    expect(within(dialog).queryByRole("option", { name: "boot (i-pending)" })).toBeNull();
    expect(within(dialog).queryByRole("option", { name: "other (i-2)" })).toBeNull();
    const device = within(dialog).getByRole("combobox", { name: "Device name" });
    expect(device).toHaveValue("/dev/sdf");
    expect(within(dialog).getByRole("group", { name: "Reserved for root volume" })).toBeTruthy();
    expect(within(device).getByRole("option", { name: "/dev/sda1" })).toBeTruthy();
    expect(within(device).getByRole("option", { name: "/dev/xvda" })).toBeTruthy();
    expect(within(dialog).getByRole("group", { name: "Recommended for data volumes" })).toBeTruthy();
    expect(within(device).getByRole("option", { name: "/dev/sdf" })).toBeTruthy();
    expect(within(device).getByRole("option", { name: "/dev/sdp" })).toBeTruthy();
    expect(within(device).getByRole("option", { name: "Specify a custom device name" })).toBeTruthy();
    expect(within(dialog).queryByRole("textbox", { name: "Custom device name" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Attach volume" })).toBeTruthy();
  });

  it("describes the device name the way EC2 does", () => {
    renderVolumes([volume("vol-1", "available", null)]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    openActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Attach volume" }));
    const dialog = screen.getByRole("dialog", { name: "Attach volume" });
    expect(
      within(dialog).getByText(
        "The device name you specify is used by EC2. The block device driver can mount the device with a device name that is different from the one you specify.",
      ),
    ).toBeTruthy();
    expect(within(dialog).queryByText(/The VWS API accepts any non-empty device name/)).toBeNull();
  });

  it("says when this Availability Zone has no running or stopped instance", () => {
    renderVolumes(
      [volume("vol-1", "available", null)],
      [{ id: "i-2", name: "other", state: "running", availabilityZone: "vws-1b" }],
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    openActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Attach volume" }));
    const dialog = screen.getByRole("dialog", { name: "Attach volume" });
    expect(
      within(dialog).getByText("There are no running or stopped instances in this Availability Zone."),
    ).toBeTruthy();
    expect(within(dialog).queryByRole("combobox", { name: "Instance" })).toBeNull();
    expect(within(dialog).getByRole("combobox", { name: "Device name" })).toBeTruthy();
  });

  it("sends the chosen instance and /dev/sdf to attach", () => {
    renderVolumes([volume("vol-1", "available", null)]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    openActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Attach volume" }));
    const dialog = screen.getByRole("dialog", { name: "Attach volume" });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Instance" }), { target: { value: "i-1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Attach volume" }));
    expect(attachVolumeAction).toHaveBeenCalledWith("vol-1", { instanceId: "i-1", device: "/dev/sdf" });
  });

  it("sends a reserved root device and a custom device name", () => {
    renderVolumes([volume("vol-1", "available", null)]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    openActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Attach volume" }));
    const dialog = screen.getByRole("dialog", { name: "Attach volume" });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Device name" }), {
      target: { value: "/dev/xvda" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Attach volume" }));
    expect(attachVolumeAction).toHaveBeenCalledWith("vol-1", { instanceId: "i-1", device: "/dev/xvda" });
  });

  it("sends a trimmed custom device name", () => {
    renderVolumes([volume("vol-1", "available", null)]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    openActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Attach volume" }));
    const dialog = screen.getByRole("dialog", { name: "Attach volume" });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Device name" }), {
      target: { value: "custom" },
    });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Custom device name" }), {
      target: { value: "  /dev/xvdz1  " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Attach volume" }));
    expect(attachVolumeAction).toHaveBeenCalledWith("vol-1", { instanceId: "i-1", device: "/dev/xvdz1" });
  });

  it("keeps the attach dialog open when the action returns an error", async () => {
    const error: ApiError = { code: "Conflict", message: "Volume vol-1 is already attached.", requestId: "req-1" };
    vi.mocked(attachVolumeAction).mockResolvedValue(error);
    renderVolumes([volume("vol-1", "available", null)]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    openActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Attach volume" }));
    fireEvent.click(screen.getByRole("button", { name: "Attach volume" }));
    const dialog = screen.getByRole("dialog", { name: "Attach volume" });
    expect(await within(dialog).findByText("Volume vol-1 is already attached.")).toBeTruthy();
  });

  it("drops the previous action error when Attach volume or Detach volume opens again", async () => {
    const error: ApiError = { code: "Conflict", message: "Volume vol-1 is already attached.", requestId: "req-1" };
    vi.mocked(attachVolumeAction).mockResolvedValue(error);
    renderVolumes([
      volume("vol-1", "available", null),
      volume("vol-2", "in-use", { instanceId: "i-1", device: "/dev/sdf" }),
    ]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    openActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Attach volume" }));
    const first = screen.getByRole("dialog", { name: "Attach volume" });
    fireEvent.click(within(first).getByRole("button", { name: "Attach volume" }));
    expect(await within(first).findByText("Volume vol-1 is already attached.")).toBeTruthy();
    fireEvent.click(within(first).getByRole("button", { name: "Cancel" }));
    openActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Attach volume" }));
    const reopened = screen.getByRole("dialog", { name: "Attach volume" });
    expect(within(reopened).queryByText("Volume vol-1 is already attached.")).toBeNull();
    expect(screen.queryByText("Volume vol-1 is already attached.")).toBeNull();
  });

  it("drops the previous action error when Detach volume opens", async () => {
    const error: ApiError = { code: "Conflict", message: "Volume vol-1 is already attached.", requestId: "req-1" };
    vi.mocked(attachVolumeAction).mockResolvedValue(error);
    renderVolumes([
      volume("vol-1", "available", null),
      volume("vol-2", "in-use", { instanceId: "i-1", device: "/dev/sdf" }),
    ]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    openActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Attach volume" }));
    const first = screen.getByRole("dialog", { name: "Attach volume" });
    fireEvent.click(within(first).getByRole("button", { name: "Attach volume" }));
    expect(await within(first).findByText("Volume vol-1 is already attached.")).toBeTruthy();
    fireEvent.click(within(first).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-2" }));
    openActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Detach volume" }));
    const detach = screen.getByRole("dialog", { name: "Detach volume" });
    expect(within(detach).queryByText("Volume vol-1 is already attached.")).toBeNull();
  });

  it("detaches an in-use volume from its instance", () => {
    renderVolumes([volume("vol-1", "in-use", { instanceId: "i-1", device: "/dev/sdf" })]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    openActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Detach volume" }));
    expect(screen.getByRole("dialog", { name: "Detach volume" })).toHaveTextContent("Detach vol-1 from i-1?");
    fireEvent.click(screen.getByRole("button", { name: "Detach" }));
    expect(detachVolumeAction).toHaveBeenCalledWith("vol-1");
    expect(detachVolumeAction).toHaveBeenCalledTimes(1);
  });
});
