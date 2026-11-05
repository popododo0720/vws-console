import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { InstanceDetailView } from "@/components/sites/console/instance-detail-view";
import type { Instance } from "@/types/console";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/app/actions/resources", () => ({
  renameInstanceAction: vi.fn(),
  startInstancesAction: vi.fn(),
  stopInstancesAction: vi.fn(),
  terminateInstancesAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  usePathname: () => "/compute/instances/i-1",
  useSearchParams: () => new URLSearchParams(),
}));

const instance: Instance = {
  id: "i-1",
  name: "web",
  state: "running",
  type: "vws.small",
  status: "none",
  checksPassed: 0,
  checksTotal: 0,
  availabilityZone: "vws-1a",
  publicDns: "",
  publicIpv4: "",
  privateIpv4: "10.0.0.2",
  privateDns: "",
  elasticIp: "",
  publicIpAllocationId: "",
  ipv6: "",
  region: "vws-1",
  vpcId: "vpc-1",
  subnetId: "subnet-1",
  keyPair: "",
  imageId: "ami-1",
  launchedAt: "",
};

describe("InstanceDetailView parity", () => {
  it("titles the page Instance summary for the instance and refreshes on demand", () => {
    render(
      <ConsoleProvider>
        <InstanceDetailView id="i-1" instance={instance} loadError={null} />
      </ConsoleProvider>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Instance summary for i-1 (web)" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2, name: "Instance summary" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Refresh instance" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows the load error instead of a blank page", () => {
    render(
      <ConsoleProvider>
        <InstanceDetailView
          id="i-404"
          instance={null}
          loadError={{ code: "InvalidInstanceID.NotFound", message: "No such instance.", requestId: "req-9" }}
        />
      </ConsoleProvider>,
    );
    expect(screen.getByRole("alert").textContent).toContain("req-9");
  });
});
