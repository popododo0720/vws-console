import { makeRule } from "@/lib/security-group-rules";
import type {
  Bucket,
  BucketObject,
  Dataset,
  InstanceTypeOption,
  InternetGateway,
  KeyPair,
  MachineImage,
  NavNode,
  NavTree,
  RouteTable,
  SecurityGroup,
  Subnet,
  Vpc,
} from "@/types/console";

export const ACCOUNT = {
  name: "demo.operator",
  id: "100200300400",
};

export const REGIONS = [
  "Europe (North)",
  "Europe (Central)",
  "US East",
  "US West",
] as const;

export const HOME_REGION = REGIONS[0];

const DEFAULT_VPC_ID = "vpc-0d4e5f6a7b8c9012";
export const DEFAULT_SG_ID = "sg-0a1b2c3d4e5f6071";

export function zonesFor(region: string) {
  if (region === "Europe (North)") return ["north-a", "north-b", "north-c"];
  if (region === "Europe (Central)") return ["central-a", "central-b"];
  if (region === "US East") return ["east-a", "east-b"];
  return ["west-a", "west-b"];
}

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

export const machineImages: MachineImage[] = [
  {
    id: "img-4c91ab02e7d35510",
    name: "Reference Linux",
    version: "2025.12",
    mark: "Lx",
    swatch: "#232f3e",
    description:
      "A general-purpose Linux image for this console. It is built for current virtual machines and stays on support through 2029.",
    arch: "64-bit",
    boot: "uefi-preferred",
    virtualization: "hvm",
    ena: true,
    rootDevice: "block",
    created: "2026-09-29",
    username: "console-user",
    starter: true,
  },
  {
    id: "img-88d10c44aa0192ef",
    name: "Desktop Unix",
    version: "15",
    mark: "Dx",
    swatch: "#8e8e93",
    description: "A desktop-oriented Unix image for interactive sessions. Graphical packages are already installed.",
    arch: "64-bit",
    boot: "uefi",
    virtualization: "hvm",
    ena: true,
    rootDevice: "block",
    created: "2026-06-11",
    username: "desktop",
    starter: false,
  },
  {
    id: "img-11ab90cc3456de01",
    name: "Community Linux",
    version: "24.04",
    mark: "Cl",
    swatch: "#e95420",
    description: "A community Linux image with a long support window and a small default package set.",
    arch: "64-bit",
    boot: "uefi-preferred",
    virtualization: "hvm",
    ena: true,
    rootDevice: "block",
    created: "2026-04-02",
    username: "console-user",
    starter: true,
  },
  {
    id: "img-77c0aa1288b34f60",
    name: "Workstation",
    version: "2025",
    mark: "Ws",
    swatch: "#0078d4",
    description: "A workstation image with remote desktop enabled and a standard admin account.",
    arch: "64-bit",
    boot: "uefi",
    virtualization: "hvm",
    ena: true,
    rootDevice: "block",
    created: "2026-03-18",
    username: "admin",
    starter: false,
  },
  {
    id: "img-55e21d90ccab7712",
    name: "Enterprise Linux",
    version: "9",
    mark: "El",
    swatch: "#cc0000",
    description: "An enterprise Linux image aimed at long-lived services and predictable updates.",
    arch: "64-bit",
    boot: "uefi-preferred",
    virtualization: "hvm",
    ena: true,
    rootDevice: "block",
    created: "2026-01-20",
    username: "console-user",
    starter: false,
  },
  {
    id: "img-22f0bb6719ac4408",
    name: "Enterprise Server",
    version: "15",
    mark: "Es",
    swatch: "#30ba78",
    description: "A server image packaged for clustered workloads and automated patching.",
    arch: "64-bit",
    boot: "uefi",
    virtualization: "hvm",
    ena: true,
    rootDevice: "block",
    created: "2025-11-02",
    username: "console-user",
    starter: false,
  },
  {
    id: "img-90aa44c812de6671",
    name: "Universal Linux",
    version: "13",
    mark: "Ul",
    swatch: "#a80030",
    description: "A minimal universal Linux image. Add packages after the first boot.",
    arch: "64-bit",
    boot: "uefi-preferred",
    virtualization: "hvm",
    ena: true,
    rootDevice: "block",
    created: "2026-08-14",
    username: "console-user",
    starter: true,
  },
];

export const instanceTypes: InstanceTypeOption[] = [
  { id: "std.micro", family: "Standard", vcpu: 2, memoryGiB: 1, currentGen: true, sampleHourly: "0.0108" },
  { id: "std.small", family: "Standard", vcpu: 2, memoryGiB: 2, currentGen: true, sampleHourly: "0.0216" },
  { id: "std.medium", family: "Standard", vcpu: 2, memoryGiB: 4, currentGen: true, sampleHourly: "0.0432" },
  { id: "mem.large", family: "Memory", vcpu: 2, memoryGiB: 8, currentGen: true, sampleHourly: "0.0920" },
  { id: "std.micro-1", family: "Standard", vcpu: 1, memoryGiB: 1, currentGen: false, sampleHourly: "0.0080" },
];

export const volumeTypeOptions = [
  { id: "General SSD", iops: 3000, throughput: "125 MB/s" },
  { id: "Throughput HDD", iops: 250, throughput: "—" },
];

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
    owner: ACCOUNT.id,
    isDefault: true,
    region: HOME_REGION,
  };
}

function defaultGroup(): SecurityGroup {
  return {
    id: DEFAULT_SG_ID,
    name: "",
    groupName: "default",
    vpcId: DEFAULT_VPC_ID,
    description: "Default network security group",
    owner: ACCOUNT.id,
    region: HOME_REGION,
    rules: [
      makeRule("in", "All", "All", DEFAULT_SG_ID, "sgr-default-in"),
      makeRule("out", "All", "All", "0.0.0.0/0", "sgr-default-out"),
    ],
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
    securityGroups: [defaultGroup()],
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
      owner: ACCOUNT.id,
      isDefault: false,
      region: HOME_REGION,
    },
  ];
  const securityGroups: SecurityGroup[] = [
    ...base.securityGroups,
    {
      id: "sg-09e21c44ab8810f3",
      name: "web",
      groupName: "web",
      vpcId: DEFAULT_VPC_ID,
      description: "Web tier",
      owner: ACCOUNT.id,
      region: HOME_REGION,
      rules: [
        makeRule("in", "TCP", "22", "0.0.0.0/0", "sgr-sample-ssh", "SSH from anywhere (sample)"),
        makeRule("in", "TCP", "443", "0.0.0.0/0", "sgr-sample-https", "HTTPS (sample)"),
        makeRule("out", "All", "All", "0.0.0.0/0", "sgr-sample-out"),
      ],
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
  return { instances: [], volumes: [], securityGroups,
    vpcs,
    subnets: MOCK_SUBNETS,
    routeTables: MOCK_ROUTE_TABLES,
    internetGateways: MOCK_INTERNET_GATEWAYS,
    buckets,
    objects: MOCK_OBJECTS,
    keyPairs,
  };
}
