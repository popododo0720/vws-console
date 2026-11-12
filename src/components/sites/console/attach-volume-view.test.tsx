import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachVolumeAction } from "@/app/actions/resources";
import { AttachVolumeView } from "@/components/sites/console/attach-volume-view";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { supported } from "@/lib/vws-api/testdata/capabilities";
import type { ApiError } from "@/lib/vws-api/adapter";
import type { Instance, Volume } from "@/types/console";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/app/actions/resources", () => ({ attachVolumeAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/storage/volumes/vol-1/attach",
  useSearchParams: () => new URLSearchParams(),
}));

const instances: Pick<Instance, "id" | "name" | "state" | "availabilityZone">[] = [
  { id: "i-pending", name: "boot", state: "pending", availabilityZone: "vws-1a" },
  { id: "i-1", name: "web", state: "running", availabilityZone: "vws-1a" },
  { id: "i-stop", name: "", state: "stopped", availabilityZone: "vws-1a" },
  { id: "i-2", name: "other", state: "running", availabilityZone: "vws-1b" },
];

const volume: Volume = {
  id: "vol-1",
  name: "data",
  state: "available",
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
  attachment: null,
};

const apiError: ApiError = { code: "Conflict", message: "Volume vol-1 is already attached.", requestId: "req-1" };

function renderAttach(props: Partial<React.ComponentProps<typeof AttachVolumeView>> = {}) {
  render(
    <ConsoleProvider capabilities={supported}>
      <AttachVolumeView
        id="vol-1"
        volume={volume}
        volumeError={null}
        instances={instances}
        instancesError={null}
        {...props}
      />
    </ConsoleProvider>,
  );
}

const attachButton = () => screen.getByRole("button", { name: "Attach volume" });
const instanceSelect = () => screen.getByRole("combobox", { name: "Instance" });
const deviceSelect = () => screen.getByRole("combobox", { name: "Device name" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(attachVolumeAction).mockResolvedValue(null);
});

describe("Attach volume page", () => {
  it("shows the AWS fields, texts and breadcrumbs", () => {
    renderAttach();
    expect(screen.getByRole("heading", { level: 1, name: "Attach volume" })).toBeTruthy();
    expect(
      screen.getByText("Attach a volume to an instance to use it as you would a regular physical hard disk drive."),
    ).toBeTruthy();
    const crumbs = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(crumbs.getByRole("link", { name: "Volumes" })).toHaveAttribute("href", "/storage/volumes");
    expect(crumbs.getByRole("link", { name: "vol-1" })).toHaveAttribute("href", "/storage/volumes/vol-1");
    expect(screen.getByRole("heading", { name: "Basic details" })).toBeTruthy();
    expect(screen.getByLabelText("Volume ID")).toHaveValue("vol-1 (data)");
    expect(screen.getByLabelText("Volume ID")).toBeDisabled();
    expect(screen.getByLabelText("Availability Zone")).toHaveValue("vws-1a");
    expect(screen.getByLabelText("Availability Zone")).toBeDisabled();
    expect(
      screen.getByText("Only instances in the same Availability Zone as the selected volume are displayed."),
    ).toBeTruthy();
    expect(
      screen.getByText("Recommended device names for Linux: /dev/sda1 for root volume. /dev/sd[f-p] for data volumes."),
    ).toBeTruthy();
    expect(screen.getByRole("note")).toHaveTextContent(
      "Newer Linux kernels may rename your devices to /dev/xvdf through /dev/xvdp internally, even when the device name entered here (and shown in the details) is /dev/sdf through /dev/sdp.",
    );
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/storage/volumes");
    expect(attachButton()).toBeEnabled();
  });

  it("lists only running or stopped instances in the volume's zone, after a placeholder", () => {
    renderAttach();
    const options = within(instanceSelect())
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual(["Choose an instance", "i-1 (web)", "i-stop"]);
    expect(instanceSelect()).toHaveValue("");
  });

  it("offers the device name groups with /dev/sdf selected", () => {
    renderAttach();
    expect(deviceSelect()).toHaveValue("/dev/sdf");
    expect(within(deviceSelect()).getByRole("group", { name: "Reserved for root volume" })).toBeTruthy();
    expect(within(deviceSelect()).getByRole("option", { name: "/dev/xvda" })).toBeTruthy();
    expect(within(deviceSelect()).getByRole("group", { name: "Recommended for data volumes" })).toBeTruthy();
    expect(within(deviceSelect()).getByRole("option", { name: "/dev/sdz" })).toBeTruthy();
    expect(within(deviceSelect()).getByRole("option", { name: "Specify a custom device name" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Custom device name" })).toBeNull();
  });

  it("sends the chosen instance and /dev/sdf, then returns to the list", async () => {
    renderAttach();
    fireEvent.change(instanceSelect(), { target: { value: "i-1" } });
    fireEvent.click(attachButton());
    expect(attachVolumeAction).toHaveBeenCalledWith("vol-1", { instanceId: "i-1", device: "/dev/sdf" });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/storage/volumes"));
  });

  it("sends a trimmed custom device name", () => {
    renderAttach();
    fireEvent.change(instanceSelect(), { target: { value: "i-stop" } });
    fireEvent.change(deviceSelect(), { target: { value: "custom" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Custom device name" }), {
      target: { value: "  /dev/xvdz1  " },
    });
    fireEvent.click(attachButton());
    expect(attachVolumeAction).toHaveBeenCalledWith("vol-1", { instanceId: "i-stop", device: "/dev/xvdz1" });
  });

  it("sends one request on a double click", () => {
    renderAttach();
    fireEvent.change(instanceSelect(), { target: { value: "i-1" } });
    fireEvent.click(attachButton());
    fireEvent.click(attachButton());
    expect(attachVolumeAction).toHaveBeenCalledTimes(1);
  });

  it("shows the error and stays on the page when the attach fails", async () => {
    vi.mocked(attachVolumeAction).mockResolvedValue(apiError);
    renderAttach();
    fireEvent.change(instanceSelect(), { target: { value: "i-1" } });
    fireEvent.click(attachButton());
    expect(await screen.findByText("The volume could not be attached")).toBeTruthy();
    expect(screen.getByText("Volume vol-1 is already attached.")).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
    await waitFor(() => expect(attachButton()).toBeEnabled());
  });

  it("asks for an instance without calling the action", () => {
    renderAttach();
    fireEvent.click(attachButton());
    expect(screen.getByText("Choose an instance.")).toBeTruthy();
    expect(attachVolumeAction).not.toHaveBeenCalled();
  });

  it.each([
    ["", "Enter a device name."],
    ["   ", "Enter a device name."],
    ["sdf", "The device name must be a path like /dev/sdf."],
    ["/dev/../etc/passwd", "The device name must be a path like /dev/sdf."],
    ["/dev/sdf; rm -rf", "The device name must be a path like /dev/sdf."],
  ])("rejects the custom device name %j without calling the action", (value, message) => {
    renderAttach();
    fireEvent.change(instanceSelect(), { target: { value: "i-1" } });
    fireEvent.change(deviceSelect(), { target: { value: "custom" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Custom device name" }), { target: { value } });
    fireEvent.click(attachButton());
    expect(screen.getByText(message)).toBeTruthy();
    expect(attachVolumeAction).not.toHaveBeenCalled();
  });

  it("disables Attach when the volume could not be loaded", () => {
    renderAttach({ volume: null, volumeError: apiError });
    expect(screen.getByText("The volume could not be loaded")).toBeTruthy();
    expect(attachButton()).toBeDisabled();
  });

  it("says when the volume is not found and links back", () => {
    renderAttach({ volume: null });
    expect(screen.getByText("Volume not found")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to volumes" })).toHaveAttribute("href", "/storage/volumes");
    expect(attachButton()).toBeDisabled();
  });

  it("disables Attach for a volume that is not available", () => {
    renderAttach({ volume: { ...volume, state: "in-use" } });
    expect(screen.getByText("vol-1 is in-use. Only an available volume can be attached.")).toBeTruthy();
    expect(attachButton()).toBeDisabled();
  });

  it("disables Attach when the instances could not be loaded", () => {
    renderAttach({ instances: [], instancesError: apiError });
    expect(screen.getByText("Instances could not be loaded")).toBeTruthy();
    expect(attachButton()).toBeDisabled();
  });

  it("says when this Availability Zone has no running or stopped instance", () => {
    renderAttach({ instances: [instances[0], instances[3]] });
    expect(screen.getByText("There are no running or stopped instances in this Availability Zone.")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Instance" })).toBeNull();
    expect(attachButton()).toBeDisabled();
  });
});
