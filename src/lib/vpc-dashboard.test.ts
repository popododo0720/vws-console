import { describe, expect, it } from "vitest";
import { createSampleAccount } from "@/lib/console-data";
import { DASHBOARD_CARDS, type DashboardInput } from "@/lib/vpc-dashboard";
import type { ElasticIp, SecurityGroup, Subnet, Vpc } from "@/types/console";

const HOME = "pve-seoul-1";
const OTHER = "us-east-1";

const sample = createSampleAccount(HOME);

function vpc(id: string): Vpc {
  return { ...sample.vpcs[0], id, region: "vws-1" };
}
function subnet(id: string, vpcId: string): Subnet {
  return { ...sample.subnets[0], id, vpcId, region: "vws-1" };
}
function group(id: string, vpcId: string): SecurityGroup {
  return { id, name: id, groupName: id, vpcId, description: "", owner: "", region: "vws-1", rules: [] };
}
function address(allocationId: string): ElasticIp {
  return { allocationId, name: "", address: "198.51.100.7", instanceId: "", privateIp: "", owner: "", region: "vws-1" };
}

const input: DashboardInput = {
  vpcs: [vpc("vpc-a"), vpc("vpc-b")],
  subnets: [subnet("subnet-1", "vpc-a"), subnet("subnet-2", "vpc-a"), subnet("subnet-3", "vpc-b")],
  securityGroups: [group("sg-1", "vpc-a"), group("sg-2", "vpc-b")],
  addresses: [address("eipalloc-1")],
  routeTables: sample.routeTables,
  internetGateways: sample.internetGateways,
  natGateways: sample.natGateways,
};

function card(key: string) {
  const found = DASHBOARD_CARDS.find((item) => item.key === key);
  if (!found) throw new Error(`no card ${key}`);
  return found;
}

describe("DASHBOARD_CARDS", () => {
  it("lists the AWS cards in row order with the list route where VWS has one", () => {
    expect(DASHBOARD_CARDS.map((item) => item.label)).toEqual([
      "VPCs",
      "Endpoint Services",
      "Subnets",
      "NAT Gateways",
      "Route Tables",
      "VPC Peering Connections",
      "Internet Gateways",
      "Network ACLs",
      "Egress-only Internet Gateways",
      "Security Groups",
      "DHCP option sets",
      "Customer Gateways",
      "Elastic IPs",
      "Virtual Private Gateways",
      "Endpoints",
      "Site-to-Site VPN Connections",
    ]);
    expect(DASHBOARD_CARDS.filter((item) => item.href).map((item) => item.href)).toEqual([
      "/network/vpcs",
      "/network/subnets",
      "/network/nat-gateways",
      "/network/route-tables",
      "/network/internet-gateways",
      "/network/security-groups",
      "/network/elastic-ips",
    ]);
  });

  it("counts API lists as the list screens show them, in every region", () => {
    expect(card("vpcs").count(input, HOME, null)).toBe(2);
    expect(card("subnets").count(input, OTHER, null)).toBe(3);
    expect(card("security-groups").count(input, HOME, null)).toBe(2);
    expect(card("elastic-ips").count(input, HOME, null)).toBe(1);
  });

  it("counts browser lists only in the region that holds them", () => {
    expect(card("nat-gateways").count(input, HOME, null)).toBe(sample.natGateways.length);
    expect(card("nat-gateways").count(input, OTHER, null)).toBe(0);
    expect(card("nat-gateways").count(input, "all", null)).toBe(sample.natGateways.length);
    expect(card("route-tables").count(input, OTHER, null)).toBe(0);
    expect(card("internet-gateways").count(input, HOME, null)).toBe(sample.internetGateways.length);
    expect(card("internet-gateways").count(input, OTHER, null)).toBe(0);
  });

  it("narrows the cards whose resources have a VPC to the chosen VPC", () => {
    expect(card("vpcs").count(input, HOME, "vpc-a")).toBe(1);
    expect(card("vpcs").count(input, HOME, "vpc-missing")).toBe(0);
    expect(card("subnets").count(input, HOME, "vpc-a")).toBe(2);
    expect(card("security-groups").count(input, HOME, "vpc-b")).toBe(1);
    const defaultVpc = sample.vpcs[0].id;
    expect(card("nat-gateways").count(input, HOME, defaultVpc)).toBe(
      sample.natGateways.filter((item) => item.vpcId === defaultVpc).length,
    );
    expect(card("route-tables").count(input, HOME, defaultVpc)).toBe(1);
  });

  it("does not narrow Elastic IPs, which belong to no VPC", () => {
    expect(card("elastic-ips").count(input, HOME, "vpc-a")).toBe(1);
  });

  it("returns null, never 0, for a card whose API list failed to load", () => {
    const failed: DashboardInput = { ...input, vpcs: null, subnets: null, securityGroups: null, addresses: null };
    for (const key of ["vpcs", "subnets", "security-groups", "elastic-ips"]) {
      expect(card(key).count(failed, HOME, null)).toBeNull();
      expect(card(key).count(failed, HOME, "vpc-a")).toBeNull();
    }
    expect(card("nat-gateways").count(failed, HOME, null)).toBe(sample.natGateways.length);
  });

  it("does not count deleted NAT gateways, which are no longer in use", () => {
    const gateways = sample.natGateways.map((item, index) =>
      index === 0 ? { ...item, state: "deleted" as const } : item,
    );
    const live = gateways.filter((item) => item.region === HOME && item.state !== "deleted").length;
    expect(card("nat-gateways").count({ ...input, natGateways: gateways }, HOME, null)).toBe(live);
  });

  it("returns 0 for resource types VWS does not model, with or without a VPC filter", () => {
    const unmodeled = DASHBOARD_CARDS.filter((item) =>
      [
        "endpoint-services",
        "peering",
        "network-acls",
        "egress-only",
        "dhcp",
        "customer-gateways",
        "virtual-private-gateways",
        "endpoints",
        "vpn",
      ].includes(item.key),
    );
    expect(unmodeled).toHaveLength(9);
    for (const item of unmodeled) {
      expect(item.count(input, HOME, null)).toBe(0);
      expect(item.count(input, HOME, "vpc-a")).toBe(0);
      expect(item.count({ ...input, vpcs: null }, HOME, null)).toBe(0);
    }
  });
});
