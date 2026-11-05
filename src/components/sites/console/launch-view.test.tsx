import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  blockPublicAccess: "",
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
    const select = screen.getByRole("combobox", { name: "Key pair name" });
    expect(select).toHaveValue("");
    expect(screen.getByRole("option", { name: "Select" })).toBeTruthy();
    expect(launchInstancesAction).not.toHaveBeenCalled();
  });

  it("requires the proceed-without acknowledgment before launch", () => {
    renderLaunch();
    const select = screen.getByRole("combobox", { name: "Key pair name" });
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
    const option = screen.getByRole("option", { name: "web" }) as HTMLOptionElement;
    fireEvent.change(screen.getByRole("combobox", { name: "Key pair name" }), { target: { value: option.value } });
    expect(screen.getByRole("button", { name: "Launch instance" })).toBeEnabled();
    expect(screen.queryByRole("checkbox", { name: /I acknowledge/ })).toBeNull();
  });

  it("selects a key pair named proceed-without by its id", () => {
    const collide: StoredKeyPair = {
      id: "key-89abcdef" as KeyPairId,
      name: "proceed-without" as KeyPairName,
      fingerprint: "fp",
      type: "rsa",
      ownerId: "123456789012",
    };
    render(
      <ConsoleProvider>
        <LaunchView
          images={[{ id: "ami-1", name: "Amazon Linux", state: "available", owner: "amazon" }]}
          instanceTypes={[{ id: "vws.small", vcpus: 1, memoryMiB: 1024 }]}
          vpcs={[vpc]}
          subnets={[subnet]}
          keyPairs={[collide]}
          loadError={null}
        />
      </ConsoleProvider>,
    );
    const option = screen.getByRole("option", { name: "proceed-without" }) as HTMLOptionElement;
    expect(option.value).toBe("key-89abcdef");
    fireEvent.change(screen.getByRole("combobox", { name: "Key pair name" }), { target: { value: option.value } });
    expect(screen.getByRole("combobox", { name: "Key pair name" })).toHaveValue("key-89abcdef");
    expect(screen.getByRole("button", { name: "Launch instance" })).toBeEnabled();
    expect(screen.queryByRole("checkbox", { name: /I acknowledge/ })).toBeNull();
  });

  it("opens key pair create from a blue text link", () => {
    renderLaunch();
    const link = screen.getByRole("button", { name: "Create new key pair" });
    expect(link.className).toContain("text-[#006ce0]");
    expect(link.className).not.toContain("bg-[#ff9900]");
    fireEvent.click(link);
    expect(screen.getByRole("dialog", { name: "Create key pair" })).toBeTruthy();
  });
});

const otherVpc: Vpc = { ...vpc, id: "vpc-2", ipv4Cidr: "10.9.0.0/16", isDefault: false };
const otherSubnet: Subnet = { ...subnet, id: "subnet-2", vpcId: "vpc-2", autoAssignPublicIp: true };

function renderWizard() {
  return render(
    <ConsoleProvider>
      <LaunchView
        images={[
          { id: "ami-1", name: "Amazon Linux", state: "available", owner: "amazon" },
          { id: "ami-2", name: "Ubuntu", state: "available", owner: "vws" },
        ]}
        instanceTypes={[{ id: "vws.small", vcpus: 1, memoryMiB: 1024 }]}
        vpcs={[vpc, otherVpc]}
        subnets={[subnet, otherSubnet]}
        keyPairs={[web]}
        loadError={null}
      />
    </ConsoleProvider>,
  );
}

function chooseKey(name: string) {
  const option = screen.getByRole("option", { name }) as HTMLOptionElement;
  fireEvent.change(screen.getByRole("combobox", { name: "Key pair name" }), { target: { value: option.value } });
}

describe("launch wizard parity", () => {
  it("shows the network read-only until Edit, then launches into the subnet picked there", async () => {
    launchInstancesAction.mockReset();
    launchInstancesAction.mockResolvedValue(null);
    renderWizard();
    expect(screen.queryByRole("combobox", { name: /VPC/ })).toBeNull();
    expect(screen.getByText("vpc-1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("combobox", { name: /VPC/ }), { target: { value: "vpc-2" } });
    expect(screen.getByRole("combobox", { name: "Subnet" })).toHaveValue("subnet-2");
    expect(screen.getByText("Enable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add additional tags" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Tag key" }), { target: { value: "team" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Tag value" }), { target: { value: "web" } });
    fireEvent.click(screen.getByRole("button", { name: "Add tag" }));
    chooseKey("web");
    fireEvent.click(screen.getByRole("button", { name: "Launch instance" }));
    await waitFor(() => expect(launchInstancesAction).toHaveBeenCalledTimes(1));
    expect(launchInstancesAction).toHaveBeenCalledWith({
      imageId: "ami-1",
      instanceType: "vws.small",
      subnetId: "subnet-2",
      count: 1,
      tags: { team: "web" },
      keyPair: { kind: "pair", name: "web" },
    });
  });

  it("filters the Quick Start images by search and says when nothing matches", () => {
    renderWizard();
    const tiles = screen.getByRole("radiogroup", { name: "Quick Start images" });
    expect(within(tiles).getAllByRole("radio")).toHaveLength(2);
    fireEvent.change(screen.getByRole("textbox", { name: "Search images" }), { target: { value: "ubuntu" } });
    fireEvent.click(within(tiles).getByRole("radio", { name: "Ubuntu" }));
    expect(screen.getByRole("combobox", { name: "VWS Machine Image (AMI)" })).toHaveValue("ami-2");
    fireEvent.change(screen.getByRole("textbox", { name: "Search images" }), { target: { value: "<b>windows" } });
    expect(screen.getByText("No images match your search.")).toBeTruthy();
  });

  it("keeps firewall and storage choices the API cannot apply disabled", () => {
    renderWizard();
    for (const name of ["Create security group", "Select existing security group", "S3 Files - new", "EFS", "FSx"]) {
      expect(screen.getByRole("radio", { name })).toBeDisabled();
    }
    expect(screen.getByRole("radio", { name: "None" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Add new volume" })).toBeDisabled();
  });

  it("shows the API error in the summary and stays on the page when launch fails", async () => {
    launchInstancesAction.mockReset();
    launchInstancesAction.mockResolvedValue({
      code: "InsufficientInstanceCapacity",
      message: "No capacity.",
      requestId: "req-1",
    });
    renderWizard();
    chooseKey("web");
    fireEvent.click(screen.getByRole("button", { name: "Launch instance" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The instance could not be launched");
    expect(alert.textContent).toContain("req-1");
    expect(await screen.findByRole("button", { name: "Launch instance" })).toBeEnabled();
  });

  it("keeps added tags visible when Add additional tags is clicked again", () => {
    renderWizard();
    const add = screen.getByRole("button", { name: "Add additional tags" });
    fireEvent.click(add);
    fireEvent.change(screen.getByRole("textbox", { name: "Tag key" }), { target: { value: "env" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Tag value" }), { target: { value: "prod" } });
    fireEvent.click(screen.getByRole("button", { name: "Add tag" }));
    fireEvent.click(add);
    expect(screen.getByText("env = prod")).toBeTruthy();
  });
});
