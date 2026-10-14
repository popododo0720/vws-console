import type {
  Bucket,
  BucketObject,
  Dataset,
  InternetGateway,
  KeyPair,
  NavNode,
  NavTree,
  RouteTable,
  Subnet,
  Vpc,
} from "@/types/console";

/** Owner ID on the sample route tables and gateways only; the account menu shows the signed-in account. */
const SAMPLE_OWNER_ID = "100200300400";

export const REGIONS = [
  "Europe (North)",
  "Europe (Central)",
  "US East",
  "US West",
] as const;

export const HOME_REGION = REGIONS[0];

const DEFAULT_VPC_ID = "vpc-0d4e5f6a7b8c9012";

export const computeNav: NavTree = {
  id: "compute",
  title: "EC2",
  sections: [
    { id: "dashboard", label: "Dashboard" },
    { id: "events", label: "Events" },
    {
      id: "instances-group",
      label: "Instances",
      children: [
        { id: "instances", label: "Instances", href: "/compute/instances" },
        { id: "types", label: "Instance Types" },
        { id: "templates", label: "Launch Templates" },
        { id: "spot", label: "Spot Requests" },
        { id: "savings", label: "Savings Plans" },
        { id: "reserved", label: "Reserved Instances" },
        { id: "hosts", label: "Dedicated Hosts" },
        { id: "reservations", label: "Capacity Reservations" },
        { id: "dense", label: "UltraServers", badge: "New" },
        { id: "capacity", label: "Capacity Manager", badge: "New" },
      ],
    },
    {
      id: "images",
      label: "Images",
      children: [
        { id: "images-list", label: "AMIs" },
        { id: "catalog", label: "AMI Catalog" },
      ],
    },
    {
      id: "block",
      label: "EBS",
      children: [
        { id: "volumes", label: "Volumes", href: "/storage/volumes" },
        { id: "snapshots", label: "Snapshots", href: "/storage/snapshots" },
        { id: "lifecycle", label: "Lifecycle Manager" },
      ],
    },
    {
      id: "netsec",
      label: "Network & Security",
      children: [
        { id: "sg", label: "Security Groups", href: "/network/security-groups" },
        { id: "addresses", label: "Elastic IPs", href: "/network/elastic-ips" },
        { id: "placement", label: "Placement Groups" },
        { id: "keys", label: "Key Pairs" },
        { id: "interfaces", label: "Network Interfaces" },
      ],
    },
    {
      id: "lb",
      label: "Load Balancing",
      children: [
        { id: "balancers", label: "Load Balancers" },
        { id: "targets", label: "Target Groups" },
      ],
    },
    {
      id: "scale",
      label: "Auto Scaling",
      children: [{ id: "groups", label: "Auto Scaling Groups" }],
    },
  ],
};

export const networkNav: NavTree = {
  id: "network",
  title: "VPC dashboard",
  sections: [
    { id: "global", label: "Global view" },
    {
      id: "vpc-group",
      label: "Virtual private cloud",
      children: [
        { id: "vpcs", label: "Your VPCs", href: "/network/vpcs" },
        { id: "subnets", label: "Subnets", href: "/network/subnets" },
        { id: "routes", label: "Route tables", href: "/network/route-tables" },
        { id: "igw", label: "Internet gateways", href: "/network/internet-gateways" },
        { id: "eigw", label: "Egress-only internet gateways" },
        { id: "carrier", label: "Carrier gateways" },
        { id: "dhcp", label: "DHCP option sets" },
        { id: "addresses", label: "Elastic IPs", href: "/network/elastic-ips" },
        { id: "prefix", label: "Managed prefix lists" },
        { id: "nat", label: "NAT gateways" },
        { id: "peer", label: "Peering connections" },
        { id: "route-servers", label: "Route servers" },
      ],
    },
    {
      id: "security",
      label: "Security",
      children: [
        { id: "nacl", label: "Network ACLs" },
        { id: "sg", label: "Security groups", href: "/network/security-groups" },
      ],
    },
    {
      id: "private",
      label: "PrivateLink and Lattice",
      children: [
        { id: "getting", label: "Getting started" },
        { id: "endpoints", label: "Endpoints" },
        { id: "endpoint-services", label: "Endpoint services" },
        { id: "service-networks", label: "Service networks" },
        { id: "lattice", label: "Lattice services" },
        { id: "resource-configs", label: "Resource configurations" },
        { id: "resource-gateways", label: "Resource gateways" },
        { id: "target-groups", label: "Target groups" },
        { id: "domains", label: "Domain verifications", badge: "New" },
      ],
    },
    {
      id: "dns",
      label: "DNS firewall",
      children: [{ id: "dns-rules", label: "Rule groups" }],
    },
  ],
};

export const storageNav: NavTree = {
  id: "storage",
  title: "S3",
  sections: [
    {
      id: "buckets-group",
      label: "Buckets",
      children: [
        { id: "general", label: "General purpose buckets", href: "/storage/buckets" },
        { id: "directory", label: "Directory buckets", href: "/storage/buckets?tab=directory" },
        { id: "table-buckets", label: "Table buckets" },
        { id: "vector-buckets", label: "Vector buckets" },
      ],
    },
    {
      id: "files",
      label: "Files",
      children: [{ id: "filesystems", label: "File systems" }],
    },
    {
      id: "access",
      label: "Access management and security",
      children: [
        { id: "access-points", label: "Access points" },
        { id: "access-files", label: "Access Points for FSx" },
        { id: "grants", label: "Access grants" },
        { id: "analyzer", label: "Access analyzer" },
      ],
    },
    {
      id: "insights",
      label: "Storage management and insights",
      children: [
        { id: "lens", label: "Storage lens" },
        { id: "batch", label: "Batch operations" },
      ],
    },
    { id: "account-settings", label: "Account and organization settings" },
    { id: "marketplace", label: "Marketplace for S3" },
  ],
};

export const navTrees = [computeNav, networkNav, storageNav];

export function linksIn(tree: NavTree) {
  const links: { label: string; href: string }[] = [];
  const walk = (nodes: NavNode[]) => {
    for (const node of nodes) {
      if (node.href) links.push({ label: node.label, href: node.href });
      if (node.children) walk(node.children);
    }
  };
  walk(tree.sections);
  return links;
}

function defaultVpc(): Vpc {
  return {
    id: DEFAULT_VPC_ID,
    name: "",
    state: "available",
    encryption: "—",
    encryptionControl: "—",
    blockPublicAccess: "off",
    ipv4Cidr: "172.31.0.0/16",
    ipv6Cidr: "",
    owner: SAMPLE_OWNER_ID,
    isDefault: true,
    region: HOME_REGION,
    tags: {},
  };
}

export function createEmptyAccount(): Dataset {
  return {
    instances: [],
    volumes: [],
    buckets: [],
    objects: [],
    keyPairs: [],
    vpcs: [defaultVpc()],
    subnets: [],
    routeTables: [],
    internetGateways: [],
  };
}

export function createSampleAccount(): Dataset {
  const base = createEmptyAccount();
  const keyPairs: KeyPair[] = [{ name: "demo-operator", fingerprint: "SHA256:9f3a1c0e7b24" }];
  const vpcs: Vpc[] = [
    ...base.vpcs,
    {
      id: "vpc-07c1e9aa22b4d310",
      name: "isolated",
      state: "available",
      encryption: "—",
      encryptionControl: "—",
      blockPublicAccess: "on",
      ipv4Cidr: "10.20.0.0/16",
      ipv6Cidr: "",
      owner: SAMPLE_OWNER_ID,
      isDefault: false,
      region: HOME_REGION,
      tags: {},
    },
  ];
  // MOCK_SUBNETS: sample-only data, shown only when the console is switched to sample data.
  const MOCK_SUBNETS: Subnet[] = [
    {
      id: "subnet-0a1b2c3d4e5f6071",
      name: "sample-public-a",
      vpcId: DEFAULT_VPC_ID,
      state: "available",
      ipv4Cidr: "172.31.0.0/20",
      availableIps: 4091,
      availabilityZone: "north-a",
      routeTableId: "rtb-0a1b2c3d4e5f6071",
      autoAssignPublicIp: true,
      region: HOME_REGION,
      tags: {},
    },
    {
      id: "subnet-0b2c3d4e5f607182",
      name: "sample-public-b",
      vpcId: DEFAULT_VPC_ID,
      state: "available",
      ipv4Cidr: "172.31.16.0/20",
      availableIps: 4091,
      availabilityZone: "north-b",
      routeTableId: "rtb-0a1b2c3d4e5f6071",
      autoAssignPublicIp: true,
      region: HOME_REGION,
      tags: {},
    },
    {
      id: "subnet-0c3d4e5f60718293",
      name: "sample-private-a",
      vpcId: "vpc-07c1e9aa22b4d310",
      state: "available",
      ipv4Cidr: "10.20.1.0/24",
      availableIps: 251,
      availabilityZone: "north-a",
      routeTableId: "rtb-0b2c3d4e5f607182",
      autoAssignPublicIp: false,
      region: HOME_REGION,
      tags: {},
    },
  ];
  // MOCK_ROUTE_TABLES: sample-only data. Each VPC has one main table; "local" routes mirror the VPC CIDR.
  const MOCK_ROUTE_TABLES: RouteTable[] = [
    {
      id: "rtb-0a1b2c3d4e5f6071",
      name: "sample-main",
      vpcId: DEFAULT_VPC_ID,
      main: true,
      subnetIds: ["subnet-0a1b2c3d4e5f6071", "subnet-0b2c3d4e5f607182"],
      routes: [
        { destination: "172.31.0.0/16", target: "local", status: "active" },
        { destination: "0.0.0.0/0", target: "igw-0a1b2c3d4e5f6071", status: "active" },
      ],
      region: HOME_REGION,
    },
    {
      id: "rtb-0b2c3d4e5f607182",
      name: "sample-isolated-main",
      vpcId: "vpc-07c1e9aa22b4d310",
      main: true,
      subnetIds: ["subnet-0c3d4e5f60718293"],
      routes: [{ destination: "10.20.0.0/16", target: "local", status: "active" }],
      region: HOME_REGION,
    },
  ];
  // MOCK_INTERNET_GATEWAYS: sample-only data.
  const MOCK_INTERNET_GATEWAYS: InternetGateway[] = [
    {
      id: "igw-0a1b2c3d4e5f6071",
      name: "sample-igw",
      state: "attached",
      vpcId: DEFAULT_VPC_ID,
      region: HOME_REGION,
    },
  ];
  const buckets: Bucket[] = [
    { name: "vws-logs", region: HOME_REGION, created: "Aug 2, 2026", kind: "general", versioning: false, blockPublicAccess: true },
    { name: "vws-media", region: "US East", created: "Sep 18, 2026", kind: "general", versioning: true, blockPublicAccess: true },
  ];
  // MOCK_OBJECTS: sample-only objects for the sample buckets. Sizes and dates are invented.
  const MOCK_OBJECTS: BucketObject[] = [
    { bucket: "vws-logs", key: "2026/", sizeBytes: 0, modified: "", storageClass: "" },
    { bucket: "vws-logs", key: "2026/access-sample.log", sizeBytes: 18432, modified: "Aug 3, 2026", storageClass: "Standard" },
    { bucket: "vws-logs", key: "readme-sample.txt", sizeBytes: 512, modified: "Aug 2, 2026", storageClass: "Standard" },
  ];
  return { instances: [], volumes: [],
    vpcs,
    subnets: MOCK_SUBNETS,
    routeTables: MOCK_ROUTE_TABLES,
    internetGateways: MOCK_INTERNET_GATEWAYS,
    buckets,
    objects: MOCK_OBJECTS,
    keyPairs,
  };
}
