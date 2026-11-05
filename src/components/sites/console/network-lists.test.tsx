import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleProvider, useConsole } from "@/components/sites/console/console-provider";
import { ElasticIpsView } from "@/components/sites/console/elastic-ips-view";
import { GatewaysView } from "@/components/sites/console/gateways-view";
import { RouteTablesView } from "@/components/sites/console/route-tables-view";
import { SubnetsView } from "@/components/sites/console/subnets-view";
import { VpcsView } from "@/components/sites/console/vpcs-view";
import { createSampleAccount } from "@/lib/console-data";
import type { Subnet, Vpc } from "@/types/console";

let search = "";

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/app/actions/resources", () => ({
  createVpcAction: vi.fn(),
  deleteVpcsAction: vi.fn(),
  renameVpcAction: vi.fn(),
  createSubnetAction: vi.fn(),
  deleteSubnetsAction: vi.fn(),
  renameSubnetAction: vi.fn(),
  allocateAddressAction: vi.fn(),
  associateAddressAction: vi.fn(),
  disassociateAddressesAction: vi.fn(),
  releaseAddressesAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/network/vpcs",
  useSearchParams: () => new URLSearchParams(search),
}));

const sample = createSampleAccount();
const vpcs: Vpc[] = sample.vpcs;
const subnets: Subnet[] = sample.subnets;

function UseSample() {
  const api = useConsole();
  return (
    <button type="button" onClick={api.showSample}>
      use sample data
    </button>
  );
}

function renderWith(view: React.ReactNode) {
  render(
    <ConsoleProvider identity={{ userName: "ada", accountId: "100200300400" }}>
      <UseSample />
      {view}
    </ConsoleProvider>,
  );
}

const headers = () =>
  within(screen.getByRole("table"))
    .getAllByRole("columnheader")
    .slice(1)
    .map((header) => header.textContent);

describe("VPC list chrome", () => {
  beforeEach(() => {
    search = "";
  });

  it("Your VPCs: title with a count, no Saved filter sets, and the AWS wording", () => {
    renderWith(<VpcsView vpcs={vpcs} subnets={subnets} loadError={null} />);
    expect(screen.getByRole("heading", { name: "Your VPCs (2)" })).toBeInTheDocument();
    expect(screen.queryByText("Saved filter sets")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /filter set/i })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Filter VPCs by attribute or tag" })).toBeInTheDocument();
    expect(headers()).toContain("Block Public Access");
    expect(screen.getByRole("heading", { name: "Select a VPC above" })).toBeInTheDocument();
    expect(screen.getByText(/Last updated/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Refresh" })).toHaveLength(1);
  });

  it("Your VPCs: says No VPCs found when the API returns none", () => {
    renderWith(<VpcsView vpcs={[]} subnets={[]} loadError={null} />);
    expect(screen.getByText("No VPCs found")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Create VPC" })).toHaveLength(1);
  });

  it("Your VPCs: opens the create dialog when the dashboard sends ?create=1", () => {
    search = "create=1";
    renderWith(<VpcsView vpcs={vpcs} subnets={subnets} loadError={null} />);
    expect(screen.getByRole("dialog", { name: "Create VPC" })).toBeInTheDocument();
  });

  it("Subnets: Block Public Access and IPv6 CIDR follow VPC, and a subnet with unknown access shows a dash", () => {
    const unknown: Subnet = { ...subnets[0], id: "subnet-unknown", blockPublicAccess: "" };
    renderWith(<SubnetsView subnets={[subnets[0], unknown]} vpcs={vpcs} loadError={null} />);
    expect(headers().slice(0, 7)).toEqual([
      "Name",
      "Subnet ID",
      "State",
      "VPC",
      "Block Public Access",
      "IPv6 CIDR",
      "IPv4 CIDR",
    ]);
    const known = within(screen.getByRole("row", { name: new RegExp(subnets[0].id) })).getAllByRole("cell");
    const missing = within(screen.getByRole("row", { name: /subnet-unknown/ })).getAllByRole("cell");
    expect(known[5].textContent).toBe("Off");
    expect(missing[5].textContent).toBe("—");
    expect(screen.getByRole("heading", { name: "Subnets (2)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Select a subnet" })).toBeInTheDocument();
    expect(screen.getByText(/Last updated/)).toBeInTheDocument();
  });

  it("Subnets: says No subnets found", () => {
    renderWith(<SubnetsView subnets={[]} vpcs={vpcs} loadError={null} />);
    expect(screen.getByText("No subnets found")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Find subnets by attribute or tag" })).toBeInTheDocument();
  });

  it("Route tables: AWS columns without Routes, owner from the account, and the empty line", () => {
    renderWith(<RouteTablesView />);
    expect(screen.getByText("No route tables found")).toBeInTheDocument();
    expect(headers()).toEqual([
      "Name",
      "Route table ID",
      "Explicit subnet associations",
      "Edge associations",
      "Main",
      "VPC",
      "Owner ID",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "use sample data" }));
    const row = within(screen.getByRole("row", { name: /rtb-0a1b2c3d4e5f6071/ }));
    const cells = row.getAllByRole("cell").map((cell) => cell.textContent);
    expect(cells[4]).toBe("—");
    expect(cells[5]).toBe("Yes");
    expect(cells[7]).toBe("100200300400");
    expect(screen.getByRole("heading", { name: "Select a route table" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Find route tables by attribute or tag" })).toBeInTheDocument();
  });

  it("Internet gateways: Attached carries the success badge, Detached is plain text", () => {
    renderWith(<GatewaysView />);
    expect(screen.getByText("No internet gateways found")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "use sample data" }));
    expect(within(screen.getByRole("row", { name: /igw-0a1b2c3d4e5f6071/ })).getByText("Attached")).toHaveClass(
      "bg-[#e7f6e9]",
    );
    expect(screen.getByRole("heading", { name: "Select an internet gateway above" })).toBeInTheDocument();
    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Find internet gateways by attribute or tag" })).toBeInTheDocument();
  });

  it("Elastic IPs: no count, Reverse DNS record after Allocation ID, and the Region empty line", () => {
    renderWith(<ElasticIpsView addresses={[]} instances={[]} loadError={null} />);
    expect(screen.getByRole("heading", { name: "Elastic IP addresses" })).toBeInTheDocument();
    expect(screen.getByText("No Elastic IP addresses found in this Region")).toBeInTheDocument();
    expect(headers().slice(0, 5)).toEqual([
      "Name",
      "Allocated IPv4 address",
      "Type",
      "Allocation ID",
      "Reverse DNS record",
    ]);
    expect(screen.getByRole("heading", { name: "Select an elastic IP address" })).toBeInTheDocument();
    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument();
  });

  it("puts the pager on the right of the filter row and offers no refresh beside the filter", () => {
    renderWith(<GatewaysView />);
    const filter = screen.getByRole("textbox", { name: "Find internet gateways by attribute or tag" });
    const row = filter.closest("div")?.parentElement as HTMLElement;
    expect(within(row).getByRole("button", { name: "Next page" })).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
  });
});
