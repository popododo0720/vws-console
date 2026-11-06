import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { detachVolumeAction } from "@/app/actions/resources";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { VolumeDetailView } from "@/components/sites/console/volume-detail-view";
import type { Volume } from "@/types/console";

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/app/actions/resources", () => ({ detachVolumeAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/storage/volumes/vol-1",
  useSearchParams: () => new URLSearchParams(),
}));

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
const inUse: Volume = { ...volume, state: "in-use", attachment: { instanceId: "i-1", device: "/dev/sdf" } };

function renderDetail(row: Volume | null) {
  render(
    <ConsoleProvider>
      <VolumeDetailView id="vol-1" volume={row} loadError={null} />
    </ConsoleProvider>,
  );
}

const openActions = () => fireEvent.click(screen.getByRole("button", { name: "Actions" }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(detachVolumeAction).mockResolvedValue(null);
});

describe("Volume detail actions", () => {
  it("links Attach volume to the attach page and disables Detach for an available volume", () => {
    renderDetail(volume);
    openActions();
    expect(screen.getByRole("menuitem", { name: "Attach volume" })).toHaveAttribute(
      "href",
      "/storage/volumes/vol-1/attach",
    );
    expect(screen.getByRole("menuitem", { name: "Detach volume" })).toBeDisabled();
  });

  it("disables Attach and enables Detach for an in-use volume", () => {
    renderDetail(inUse);
    openActions();
    expect(screen.getByRole("menuitem", { name: "Attach volume" })).not.toHaveAttribute("href");
    expect(screen.getByRole("menuitem", { name: "Detach volume" })).toBeEnabled();
  });

  it("disables both for a volume that is creating", () => {
    renderDetail({ ...volume, state: "creating" });
    openActions();
    expect(screen.getByRole("menuitem", { name: "Attach volume" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Detach volume" })).toBeDisabled();
  });

  it("detaches after confirming in the dialog", () => {
    renderDetail(inUse);
    openActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Detach volume" }));
    const dialog = screen.getByRole("dialog", { name: "Detach volume" });
    expect(dialog).toHaveTextContent("from instance i-1 (/dev/sdf)");
    expect(detachVolumeAction).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Detach" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Detach" }));
    expect(detachVolumeAction).toHaveBeenCalledWith("vol-1");
    expect(detachVolumeAction).toHaveBeenCalledTimes(1);
  });

  it("has no Actions menu when the volume was not found", () => {
    renderDetail(null);
    expect(screen.queryByRole("button", { name: "Actions" })).toBeNull();
  });
});
