export type InstanceState = "pending" | "running" | "stopping" | "stopped" | "shutting-down" | "terminated";

export type CheckStatus = "ok" | "initializing" | "impaired" | "none";

export type Instance = {
  id: string;
  name: string;
  state: InstanceState;
  type: string;
  status: CheckStatus;
  checksPassed: number;
  checksTotal: number;
  availabilityZone: string;
  publicDns: string;
  publicIpv4: string;
  privateIpv4: string;
  /** Server-provided private DNS name; empty when the API does not supply one. */
  privateDns: string;
  elasticIp: string;
  /** Allocation ID of the Elastic IP that supplies the public IP, if any. */
  publicIpAllocationId: string;
  ipv6: string;
  region: string;
  vpcId: string;
  subnetId: string;
  keyPair: string;
  imageId: string;
  launchedAt: string;
};

export type Volume = {
  id: string;
  name: string;
  /** API volume status (creating, available, in-use, ...); empty for local data. */
  state: string;
  volumeType: string;
  sizeGiB: number;
  iops: number | null;
  throughput: string;
  owner: string;
  snapshotId: string;
  sourceVolumeId: string;
  created: string;
  availabilityZone: string;
  region: string;
  attachedTo: string;
};

export type Snapshot = {
  id: string;
  name: string;
  volumeId: string;
  sizeGiB: number;
  description: string;
  state: string;
  started: string;
  owner: string;
  region: string;
};

export type SecurityGroupRule = {
  id: string;
  description: string;
  direction: "in" | "out";
  protocol: string;
  port: string;
  source: string;
};

export type SecurityGroup = {
  id: string;
  name: string;
  groupName: string;
  vpcId: string;
  description: string;
  owner: string;
  region: string;
  rules: SecurityGroupRule[];
};

export type Vpc = {
  id: string;
  name: string;
  state: "available" | "pending";
  encryption: string;
  encryptionControl: string;
  blockPublicAccess: "off" | "on" | "";
  ipv4Cidr: string;
  ipv6Cidr: string;
  owner: string;
  isDefault: boolean | null;
  region: string;
  tags: Record<string, string>;
};

export type Subnet = {
  id: string;
  name: string;
  vpcId: string;
  state: "available" | "pending";
  ipv4Cidr: string;
  availableIps: number | null;
  availabilityZone: string;
  routeTableId: string;
  autoAssignPublicIp: boolean | null;
  region: string;
  tags: Record<string, string>;
};

export type Route = {
  destination: string;
  target: string;
  status: "active" | "blackhole";
};

export type RouteTable = {
  id: string;
  name: string;
  vpcId: string;
  main: boolean;
  subnetIds: string[];
  routes: Route[];
  region: string;
};

export type InternetGateway = {
  id: string;
  name: string;
  state: "attached" | "detached";
  vpcId: string;
  region: string;
};

export type ElasticIp = {
  allocationId: string;
  name: string;
  address: string;
  instanceId: string;
  privateIp: string;
  owner: string;
  region: string;
};

export type BucketKind = "general" | "directory";

export type Bucket = {
  name: string;
  region: string;
  created: string;
  kind: BucketKind;
  versioning: boolean;
  blockPublicAccess: boolean;
};

export type BucketObject = {
  bucket: string;
  /** Full key, using "/" as the folder delimiter. Folders end with "/". */
  key: string;
  sizeBytes: number;
  modified: string;
  storageClass: string;
};

export type KeyPair = {
  name: string;
  fingerprint: string;
};

export type Dataset = {
  instances: Instance[];
  volumes: Volume[];
  vpcs: Vpc[];
  subnets: Subnet[];
  routeTables: RouteTable[];
  internetGateways: InternetGateway[];
  buckets: Bucket[];
  objects: BucketObject[];
  keyPairs: KeyPair[];
};

export type NavNode = {
  id: string;
  label: string;
  href?: string;
  badge?: string;
  defaultOpen?: boolean;
  children?: NavNode[];
};

export type NavTree = {
  id: string;
  title: string;
  sections: NavNode[];
};
