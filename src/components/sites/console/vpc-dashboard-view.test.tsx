import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleProvider, useConsole } from "@/components/sites/console/console-provider";
import { VpcDashboardView } from "@/components/sites/console/vpc-dashboard-view";
import { createSampleAccount } from "@/lib/console-data";
import type { ApiError, ApiResult, Region } from "@/lib/vws-api/adapter";
import type { SecurityGroup, Subnet, Vpc } from "@/types/console";

const refresh = vi.fn();

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  usePathname: () => "/network",
  useSearchParams: () => new URLSearchParams(),
}));

const sample = createSampleAccount("pve-busan-1");
const listed: ApiResult<Region[]> = {
  ok: true,
  value: [
    { name: "pve-busan-1", kind: "pve", state: "available" },
    { name: "pve-seoul-1", kind: "pve", state: "available" },
  ],
};
const vpcs: Vpc[] = sample.vpcs.map((item) => ({ ...item, region: "vws-1" }));
const subnets: Subnet[] = sample.subnets.map((item) => ({ ...item, region: "vws-1" }));
const securityGroups: SecurityGroup[] = [
  {
    id: "sg-1",
    name: "web",
    groupName: "web",
    vpcId: vpcs[0].id,
    description: "",
    owner: "",
    region: "vws-1",
    rules: [],
  },
];
const failure: ApiError = { code: "Unavailable", message: "Upstream is down.", requestId: "req-42" };

function UseSample() {
  const api = useConsole();
  return (
    <button type="button" onClick={api.showSample}>
      use sample data
    </button>
  );
}

function renderDashboard(props: Partial<Parameters<typeof VpcDashboardView>[0]> = {}) {
  render(
    <ConsoleProvider regions={listed}>
      <UseSample />
      <VpcDashboardView
        vpcs={vpcs}
        subnets={subnets}
        securityGroups={securityGroups}
        addresses={[]}
        loadErrors={[]}
        {...props}
      />
    </ConsoleProvider>,
  );
}

const card = (name: string) => within(screen.getByRole("region", { name }));

describe("VpcDashboardView", () => {
  beforeEach(() => refresh.mockReset());

  it("shows the region's count in each card and links the label and the count to the list", () => {
    renderDashboard();
    const subnetCard = card("Subnets");
    expect(subnetCard.getByText(/pve-busan-1/)).toBeInTheDocument();
    expect(subnetCard.getByRole("link", { name: "Subnets" })).toHaveAttribute("href", "/network/subnets");
    expect(subnetCard.getByRole("link", { name: "3" })).toHaveAttribute("href", "/network/subnets");
    expect(card("VPCs").getByRole("link", { name: "2" })).toHaveAttribute("href", "/network/vpcs");
    expect(card("Security Groups").getByRole("link", { name: "1" })).toBeInTheDocument();
  });

  it("shows browser-only counts once the sample data is on, and 0 for unmodeled types", () => {
    renderDashboard();
    expect(card("NAT Gateways").getByRole("link", { name: "0" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "use sample data" }));
    expect(card("NAT Gateways").getByRole("link", { name: String(sample.natGateways.length) })).toBeInTheDocument();
    expect(card("Network ACLs").queryByRole("link")).not.toBeInTheDocument();
    expect(card("Network ACLs").getByText("0")).toBeInTheDocument();
  });

  it("shows a dash and the error with its request id when a list failed, never 0", () => {
    renderDashboard({ subnets: null, loadErrors: [{ label: "Subnets", error: failure }] });
    expect(card("Subnets").getByText("—")).toBeInTheDocument();
    expect(card("Subnets").queryByText("0")).not.toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Subnets could not be loaded");
    expect(alert).toHaveTextContent("Unavailable");
    expect(alert).toHaveTextContent("req-42");
    expect(card("VPCs").getByRole("link", { name: "2" })).toBeInTheDocument();
  });

  it("narrows the counts when a VPC is chosen in the side nav filter", () => {
    renderDashboard();
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by VPC" }), { target: { value: vpcs[1].id } });
    expect(card("VPCs").getByRole("link", { name: "1" })).toBeInTheDocument();
    expect(card("Subnets").getByRole("link", { name: "1" })).toBeInTheDocument();
    expect(card("Security Groups").getByText("0")).toBeInTheDocument();
  });

  it("drops the VPC filter once the chosen VPC is gone, so the counts match the select", () => {
    const { rerender } = render(
      <ConsoleProvider regions={listed}>
        <VpcDashboardView
          vpcs={vpcs}
          subnets={subnets}
          securityGroups={securityGroups}
          addresses={[]}
          loadErrors={[]}
        />
      </ConsoleProvider>,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by VPC" }), { target: { value: vpcs[1].id } });
    const remaining = vpcs.filter((item) => item.id !== vpcs[1].id);
    rerender(
      <ConsoleProvider regions={listed}>
        <VpcDashboardView
          vpcs={remaining}
          subnets={subnets.filter((item) => item.vpcId !== vpcs[1].id)}
          securityGroups={securityGroups}
          addresses={[]}
          loadErrors={[]}
        />
      </ConsoleProvider>,
    );
    expect(screen.getByRole("combobox", { name: "Filter by VPC" })).toHaveValue("all");
    expect(card("VPCs").getByRole("link", { name: String(remaining.length) })).toBeInTheDocument();
  });

  it("expands See all regions into one line per region", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: "use sample data" }));
    const gateways = card("Internet Gateways");
    expect(gateways.queryByText("pve-seoul-1")).not.toBeInTheDocument();
    fireEvent.click(gateways.getByRole("button", { name: /See all regions/ }));
    const lines = gateways.getAllByRole("listitem").map((item) => item.textContent);
    expect(lines).toEqual(["pve-busan-11", "pve-seoul-10"]);
  });

  it("links only the current region's count under See all regions, since the lists show the current region", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: "use sample data" }));
    const gateways = card("NAT Gateways");
    fireEvent.click(gateways.getByRole("button", { name: /See all regions/ }));
    const [home, ...others] = gateways.getAllByRole("listitem");
    expect(within(home).getByRole("link")).toHaveAttribute("href", "/network/nat-gateways");
    for (const line of others) expect(within(line).queryByRole("link")).not.toBeInTheDocument();
  });

  it("styles the count of a type with no VWS list like the AWS count link, without a link", () => {
    renderDashboard();
    const count = card("Network ACLs").getByText("0");
    expect(count.tagName).toBe("SPAN");
    expect(count).toHaveClass("underline");
  });

  it("offers Create VPC and Launch EC2 Instances, refreshes on request, and has no Q banner", () => {
    renderDashboard();
    expect(screen.getByRole("link", { name: "Create VPC" })).toHaveAttribute("href", "/network/vpcs?create=1");
    expect(screen.getByRole("link", { name: "Launch EC2 Instances" })).toHaveAttribute("href", "/compute/launch");
    expect(screen.getByText("Note: Your Instances will launch in the pve-busan-1 region.")).toBeInTheDocument();
    expect(screen.getByText("You are using the following VWS VPC resources")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh Resources" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Amazon Q/i)).not.toBeInTheDocument();
  });

  it("renders the side panels with entries that have no VWS target as text, not links", () => {
    renderDashboard();
    for (const title of ["Service Health", "Settings", "Additional Information", "VWS Network Manager"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    for (const text of [
      "View complete service health details",
      "Zones",
      "VPC Documentation",
      "Get started with Network Manager",
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: text })).not.toBeInTheDocument();
    }
  });

  it("lists the cards in the AWS order", () => {
    renderDashboard();
    const labels = screen
      .getAllByRole("region")
      .map((section) => section.getAttribute("aria-label"))
      .filter(Boolean);
    expect(labels.slice(0, 4)).toEqual(["VPCs", "Endpoint Services", "Subnets", "NAT Gateways"]);
    expect(labels).toHaveLength(16);
  });
});
