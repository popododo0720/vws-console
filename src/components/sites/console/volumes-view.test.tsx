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
    expect(within(dialog).getByRole("combobox")).toBeTruthy();
    expect(within(dialog).getByRole("option", { name: "web (i-1)" })).toBeTruthy();
    expect(within(dialog).getByRole("option", { name: "i-stop" })).toBeTruthy();
    expect(within(dialog).queryByRole("option", { name: "boot (i-pending)" })).toBeNull();
    expect(within(dialog).queryByRole("option", { name: "other (i-2)" })).toBeNull();
    expect(within(dialog).getByRole("textbox", { name: "Device name" })).toHaveValue("/dev/sdf");
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
    expect(within(dialog).queryByRole("combobox")).toBeNull();
  });

  it("sends the chosen instance and /dev/sdf to attach", () => {
    renderVolumes([volume("vol-1", "available", null)]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select vol-1" }));
    openActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Attach volume" }));
    const dialog = screen.getByRole("dialog", { name: "Attach volume" });
    fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "i-1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Attach volume" }));
    expect(attachVolumeAction).toHaveBeenCalledWith("vol-1", { instanceId: "i-1", device: "/dev/sdf" });
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
