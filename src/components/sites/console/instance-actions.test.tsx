import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { InstanceDetailView } from "@/components/sites/console/instance-detail-view";
import { InstancesView } from "@/components/sites/console/instances-view";
import { awsRegion, loaded, pveWritable } from "@/lib/vws-api/testdata/capabilities";
import type { Instance } from "@/types/console";

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/app/actions/resources", () => ({
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

type Read = ComponentProps<typeof ConsoleProvider>["capabilities"];
const show = (capabilities: Read, ui: ReactNode) =>
  render(<ConsoleProvider capabilities={capabilities}>{ui}</ConsoleProvider>);

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
