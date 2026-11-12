import type { ElasticIp, InternetGateway, NatGateway, RouteTable, SecurityGroup, Subnet, Vpc } from "@/types/console";
import { ALL_REGIONS } from "@/lib/vws-api/adapter";

/**
 * The API lists are null when they failed to load. They belong to one cluster that the region menu does not model,
 * so every list screen shows them in every region, and the dashboard counts them the same way.
 */
export type DashboardInput = {
  vpcs: readonly Vpc[] | null;
  subnets: readonly Subnet[] | null;
  securityGroups: readonly SecurityGroup[] | null;
  addresses: readonly ElasticIp[] | null;
  routeTables: readonly RouteTable[];
  internetGateways: readonly InternetGateway[];
  natGateways: readonly NatGateway[];
};

export type DashboardCard = {
  key: string;
  label: string;
  /** The list screen, when VWS has one. */
  href?: string;
  /** Null when the data could not be loaded. */
  count: (input: DashboardInput, region: string, vpcId: string | null) => number | null;
};

const inVpc = (vpcId: string | null) => (item: { vpcId: string }) => vpcId === null || item.vpcId === vpcId;

const fromApi =
  (read: (input: DashboardInput) => readonly { vpcId: string }[] | null): DashboardCard["count"] =>
  (input, _region, vpcId) =>
    read(input)?.filter(inVpc(vpcId)).length ?? null;

const fromBrowser =
  (read: (input: DashboardInput) => readonly { vpcId: string; region: string }[]): DashboardCard["count"] =>
  (input, region, vpcId) =>
    read(input).filter((item) => (region === ALL_REGIONS || item.region === region) && inVpc(vpcId)(item)).length;

const notModeled: DashboardCard["count"] = () => 0;

/** In the AWS console's order, read row by row across its two columns. */
export const DASHBOARD_CARDS: readonly DashboardCard[] = [
  {
    key: "vpcs",
    label: "VPCs",
    href: "/network/vpcs",
    count: (input, _region, vpcId) => input.vpcs?.filter((vpc) => vpcId === null || vpc.id === vpcId).length ?? null,
  },
  { key: "endpoint-services", label: "Endpoint Services", count: notModeled },
  { key: "subnets", label: "Subnets", href: "/network/subnets", count: fromApi((input) => input.subnets) },
  {
    key: "nat-gateways",
    label: "NAT Gateways",
    href: "/network/nat-gateways",
    count: fromBrowser((input) => input.natGateways.filter((gateway) => gateway.state !== "deleted")),
  },
  {
    key: "route-tables",
    label: "Route Tables",
    href: "/network/route-tables",
    count: fromBrowser((input) => input.routeTables),
  },
  { key: "peering", label: "VPC Peering Connections", count: notModeled },
  {
    key: "internet-gateways",
    label: "Internet Gateways",
    href: "/network/internet-gateways",
    count: fromBrowser((input) => input.internetGateways),
  },
  { key: "network-acls", label: "Network ACLs", count: notModeled },
  { key: "egress-only", label: "Egress-only Internet Gateways", count: notModeled },
  {
    key: "security-groups",
    label: "Security Groups",
    href: "/network/security-groups",
    count: fromApi((input) => input.securityGroups),
  },
  { key: "dhcp", label: "DHCP option sets", count: notModeled },
  { key: "customer-gateways", label: "Customer Gateways", count: notModeled },
  {
    key: "elastic-ips",
    label: "Elastic IPs",
    href: "/network/elastic-ips",
    count: (input) => input.addresses?.length ?? null,
  },
  { key: "virtual-private-gateways", label: "Virtual Private Gateways", count: notModeled },
  { key: "endpoints", label: "Endpoints", count: notModeled },
  { key: "vpn", label: "Site-to-Site VPN Connections", count: notModeled },
];
