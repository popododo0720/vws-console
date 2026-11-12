import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { CreateVolumeView } from "@/components/sites/console/create-volume-view";
import { ElasticIpsView } from "@/components/sites/console/elastic-ips-view";
import { NameCell } from "@/components/sites/console/resource-table";
import { VolumesView } from "@/components/sites/console/volumes-view";
import { awsRegion, loaded, pveLiveBox, pveWritable } from "@/lib/vws-api/testdata/capabilities";

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/app/actions/resources", () => ({
  allocateAddressAction: vi.fn(),
  associateAddressAction: vi.fn(),
  createVolumeAction: vi.fn(),
  deleteVolumesAction: vi.fn(),
  detachVolumeAction: vi.fn(),
  disassociateAddressesAction: vi.fn(),
  modifyVolumeAction: vi.fn(),
  releaseAddressesAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/storage/volumes",
  useSearchParams: () => new URLSearchParams(),
}));

type Read = ComponentProps<typeof ConsoleProvider>["capabilities"];
const show = (capabilities: Read, ui: ReactNode) =>
  render(<ConsoleProvider capabilities={capabilities}>{ui}</ConsoleProvider>);
const volumes = <VolumesView volumes={[]} loadError={null} loadedAt="2026-11-05T08:26:38.000Z" />;
const createVolume = () => screen.getByRole("button", { name: "Create volume" });
const unread = { code: "ServiceUnavailable", message: "The VWS console API did not answer.", requestId: "req-9" };

describe("actions gated by the region's capability document", () => {
  it("disables the button and the menu entries a read-only pve region refuses, with its reason as the tooltip", () => {
    show(loaded(pveLiveBox), volumes);
    expect(createVolume()).toBeDisabled();
    expect(createVolume()).toHaveAccessibleDescription("read-only");
    expect(screen.queryByRole("link", { name: "Create volume" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Actions/ }));
    for (const name of ["Modify volume", "Delete volume", "Attach volume", "Detach volume"]) {
      expect(screen.getByRole("menuitem", { name })).toBeDisabled();
      expect(screen.getByRole("menuitem", { name })).toHaveAccessibleDescription("read-only");
    }
    expect(screen.getAllByRole("tooltip")[0]).toHaveTextContent("read-only");
  });

  it("leaves every action of an AWS region enabled, with no tooltip", () => {
    show(loaded(awsRegion), volumes);
    expect(screen.getByRole("link", { name: "Create volume" })).toHaveAttribute("href", "/storage/volumes/create");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("disables only the action a region refuses", () => {
    show(loaded(pveWritable), <ElasticIpsView addresses={[]} instances={[]} loadError={null} />);
    const allocate = screen.getByRole("button", { name: "Allocate Elastic IP address" });
    expect(allocate).toBeDisabled();
    expect(allocate).toHaveAccessibleDescription("pve-lab-1 does not support Elastic IP");
    fireEvent.click(screen.getByRole("button", { name: /Actions/ }));
    expect(screen.getByRole("menuitem", { name: "Release Elastic IP addresses" })).toHaveAccessibleDescription("");
  });

  it("disables the inline name edit, which writes a tag", () => {
    show(loaded(pveLiveBox), <NameCell value="web" onRename={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Edit name" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit name" })).toHaveAccessibleDescription("read-only");
  });

  it("keeps the button of a partial action and turns off only the input its reason code names", () => {
    const form = <CreateVolumeView snapshots={[]} snapshotsError={null} zones={["pve-lab-1a"]} initialSnapshotId="" />;
    const view = show(loaded(pveWritable), form);
    expect(createVolume()).toBeEnabled();
    expect(screen.getByLabelText(/Snapshot ID/)).toBeDisabled();
    expect(screen.getByText("pve-lab-1 does not create volumes from snapshots")).toBeInTheDocument();
    for (const label of ["Volume type", "Size (GiB)", "Availability Zone"]) {
      expect(screen.getByLabelText(label)).toBeEnabled();
    }
    view.unmount();
    show(loaded(awsRegion), form);
    expect(screen.getByLabelText(/Snapshot ID/)).toBeEnabled();
  });

  it.each<[string, Read]>([
    ["the capability read failed", { ok: false, error: unread }],
    ["no single region is selected", { ok: true, value: null }],
    ["no document was read", null],
    ["the document names no action", loaded({ region: "r-1" })],
  ])("refuses every action with a reason when %s", (_case, capabilities) => {
    show(capabilities, volumes);
    expect(createVolume()).toBeDisabled();
    expect(createVolume()).toHaveAccessibleDescription(/\S/);
  });

  it("shows the error code and request ID when the capability read failed, and none otherwise", () => {
    const view = show({ ok: false, error: unread }, volumes);
    expect(screen.getByRole("alert")).toHaveTextContent("ServiceUnavailable · Request ID req-9");
    view.unmount();
    show(loaded(awsRegion), volumes);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
