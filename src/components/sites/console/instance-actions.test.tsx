import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { CreateSnapshotView } from "@/components/sites/console/create-snapshot-view";
import { InstanceDetailView } from "@/components/sites/console/instance-detail-view";
import { InstancesView } from "@/components/sites/console/instances-view";
import { LaunchView } from "@/components/sites/console/launch-view";
import { awsRegion, loaded, pveLiveBox, pveWritable } from "@/lib/vws-api/testdata/capabilities";
import type { Instance } from "@/types/console";

const rebootInstancesAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/app/actions/resources", () => ({
  createKeyPairAction: vi.fn(),
  createSnapshotAction: vi.fn(),
  launchInstancesAction: vi.fn(),
  rebootInstancesAction,
  renameInstanceAction: vi.fn(),
  startInstancesAction: vi.fn(),
  stopInstancesAction: vi.fn(),
  terminateInstancesAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/compute/instances",
  useSearchParams: () => new URLSearchParams(),
}));

const instance = (id: string, state: Instance["state"]): Instance => ({
  ...{ id, state, name: "", type: "", status: "none", checksPassed: 0, checksTotal: 0, region: "" },
  ...{ availabilityZone: "", publicDns: "", publicIpv4: "", privateIpv4: "", privateDns: "", elasticIp: "" },
  ...{ publicIpAllocationId: "", ipv6: "", vpcId: "", subnetId: "", keyPair: "", imageId: "", launchedAt: "" },
});
const running = instance("i-0000000a", "running");
const rows = [running, instance("i-0000000b", "stopped")];
const list = <InstancesView instances={rows} loadError={null} />;
const detail = <InstanceDetailView id={running.id} instance={running} loadError={null} />;
const ENTRIES = ["Stop instance", "Start instance", "Reboot instance", "Terminate (delete) instance"];

type Read = ComponentProps<typeof ConsoleProvider>["capabilities"];
const show = (capabilities: Read, ui: ReactNode) =>
  render(<ConsoleProvider capabilities={capabilities}>{ui}</ConsoleProvider>);

/** Selects every listed instance, opens Instance state and returns its entries in menu order. */
function stateMenu() {
  for (const box of screen.queryAllByRole("checkbox", { name: /^Select i-/, checked: false })) fireEvent.click(box);
  fireEvent.click(screen.getAllByRole("button", { name: /^Instance state/ })[0]);
  return screen.getAllByRole<HTMLButtonElement>("menuitem");
}

beforeEach(() => vi.clearAllMocks());

describe("instance actions gated by the region's capability document", () => {
  it.each([
    ["the list", list],
    ["the detail page", detail],
  ])("shows every Instance state entry on %s of a read-only pve region, disabled with its reason", (_where, view) => {
    show(loaded(pveLiveBox), view);
    const entries = stateMenu();
    expect(entries.map((entry) => entry.textContent)).toEqual(ENTRIES);
    for (const entry of entries) {
      expect(entry).toBeDisabled();
      expect(entry).toHaveAccessibleDescription("read-only");
    }
  });

  it.each<[string, ReactNode]>([
    ["Launch instances", list],
    [
      "Launch instance",
      <LaunchView key="l" images={[]} instanceTypes={[]} vpcs={[]} subnets={[]} keyPairs={[]} loadError={null} />,
    ],
    ["Create snapshot", <CreateSnapshotView key="s" volumes={[]} volumesError={null} initialVolumeId="" />],
  ])("keeps %s on the page of a read-only pve region, disabled with its reason", (name, view) => {
    show(loaded(pveLiveBox), view);
    expect(screen.getByRole("button", { name })).toBeDisabled();
    expect(screen.getByRole("button", { name })).toHaveAccessibleDescription("read-only");
  });

  it("leaves an AWS region's entries to the instance state alone, with no reason", () => {
    show(loaded(awsRegion), detail);
    expect(stateMenu().map((entry) => [entry.textContent, entry.disabled])).toEqual([
      ["Stop instance", false],
      ["Start instance", true],
      ["Reboot instance", false],
      ["Terminate (delete) instance", false],
    ]);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("disables Reboot alone when the region refuses only ec2:RebootInstances", () => {
    const refused = { state: "unsupported", reasonCode: "NoReboot", reason: "this region does not reboot" };
    show(loaded({ ...awsRegion, actions: { ...awsRegion.actions, "ec2:RebootInstances": refused } }), detail);
    const [stop, , reboot] = stateMenu();
    expect(reboot).toBeDisabled();
    expect(reboot).toHaveAccessibleDescription("this region does not reboot");
    expect(stop).toBeEnabled();
  });
});

describe("Reboot instance", () => {
  it("sends the running instances once and shows the operation running, then succeeded", async () => {
    const operation = Promise.withResolvers<null>();
    rebootInstancesAction.mockReturnValue(operation.promise);
    show(loaded(pveWritable), list);
    fireEvent.click(stateMenu()[2]);
    expect(screen.getByRole("status")).toHaveTextContent("Rebooting i-0000000a…");
    for (const entry of stateMenu()) expect(entry).toBeDisabled();
    fireEvent.click(screen.getByRole("menuitem", { name: "Reboot instance" }));
    operation.resolve(null);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Successfully rebooted i-0000000a"));
    expect(rebootInstancesAction.mock.calls).toEqual([[["i-0000000a"]]]);
  });

  it("shows the error state, and no success, when console-api refuses the reboot", async () => {
    const refused = { code: "Conflict", message: "instance cannot be rebooted from stopped", requestId: "req-7" };
    rebootInstancesAction.mockResolvedValue(refused);
    show(loaded(awsRegion), detail);
    fireEvent.click(stateMenu()[2]);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The instance action failed");
    expect(alert).toHaveTextContent("instance cannot be rebooted from stopped");
    expect(alert).toHaveTextContent("Conflict · Request ID req-7");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(stateMenu()[2]).toBeEnabled();
  });
});

describe("terminated instances", () => {
  const gone = instance("i-0000000c", "terminated");

  it.each<[string, Read, boolean]>([
    ["drops them in a region whose document says terminatedVisible false", loaded(pveWritable), false],
    ["lists them in a region that does not send the flag", loaded(awsRegion), true],
    ["lists them when no document was read", null, true],
  ])("%s", (_case, capabilities, listed) => {
    const view = show(capabilities, <InstancesView instances={[running, gone]} loadError={null} />);
    expect(screen.getByRole("checkbox", { name: `Select ${running.id}` })).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox", { name: `Select ${gone.id}` })).toHaveLength(listed ? 1 : 0);
    view.unmount();
    show(capabilities, <InstanceDetailView id={gone.id} instance={gone} loadError={null} />);
    expect(screen.queryAllByText("Instance not found")).toHaveLength(listed ? 0 : 1);
  });
});
