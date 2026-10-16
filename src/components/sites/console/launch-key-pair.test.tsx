import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { LaunchView } from "@/components/sites/console/launch-view";
import type { KeyPairId, KeyPairName, StoredKeyPair } from "@/lib/key-pair";
import type { Subnet, Vpc } from "@/types/console";

const launchInstancesAction = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => "/compute/launch",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/actions/resources", () => ({
  launchInstancesAction,
  createKeyPairAction: vi.fn(),
}));

const vpc: Vpc = {
  id: "vpc-1",
  name: "default",
  state: "available",
  encryption: "",
  encryptionControl: "",
  blockPublicAccess: "off",
  ipv4Cidr: "10.0.0.0/16",
  ipv6Cidr: "",
  owner: "123456789012",
  isDefault: true,
  region: "vws-1",
  tags: {},
};

const subnet: Subnet = {
  id: "subnet-1",
  name: "default",
  vpcId: "vpc-1",
  state: "available",
  ipv4Cidr: "10.0.1.0/24",
  availableIps: 250,
  availabilityZone: "vws-1a",
  routeTableId: "rtb-1",
  autoAssignPublicIp: null,
  region: "vws-1",
  tags: {},
};

const web: StoredKeyPair = {
  id: "key-01234567" as KeyPairId,
  name: "web" as KeyPairName,
  fingerprint: "fp",
  type: "rsa",
  ownerId: "123456789012",
};

function renderLaunch() {
  return render(
    <ConsoleProvider>
      <LaunchView
        images={[{ id: "ami-1", name: "Amazon Linux", state: "available", owner: "amazon" }]}
        instanceTypes={[{ id: "vws.small", vcpus: 1, memoryMiB: 1024 }]}
        vpcs={[vpc]}
        subnets={[subnet]}
        keyPairs={[web]}
        loadError={null}
      />
    </ConsoleProvider>,
  );
}

describe("launch key pair selection", () => {
  it("starts with no key pair selected and keeps launch disabled", () => {
    renderLaunch();
    expect(screen.getByRole("button", { name: "Launch instance" })).toBeDisabled();
    const select = screen.getByRole("combobox", { name: "Key pair" });
    expect(select).toHaveValue("");
    expect(screen.getByRole("option", { name: "Select a key pair" })).toBeTruthy();
    expect(launchInstancesAction).not.toHaveBeenCalled();
  });

  it("requires the proceed-without acknowledgment before launch", () => {
    renderLaunch();
    const select = screen.getByRole("combobox", { name: "Key pair" });
    const proceed = screen.getByRole("option", { name: "Proceed without a key pair (Not recommended)" });
    fireEvent.change(select, { target: { value: (proceed as HTMLOptionElement).value } });
    expect(
      screen.getByText(
        "I acknowledge that I will not be able to connect to this instance unless I already know the password built into this AMI.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Launch instance" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /I acknowledge that I will not be able to connect/ }));
    expect(screen.getByRole("button", { name: "Launch instance" })).toBeEnabled();
  });

  it("enables launch after an explicit key pair selection", () => {
    renderLaunch();
    expect(screen.getByRole("button", { name: "Launch instance" })).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox", { name: "Key pair" }), { target: { value: "web" } });
    expect(screen.getByRole("button", { name: "Launch instance" })).toBeEnabled();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
