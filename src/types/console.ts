export type InstanceState = "pending" | "running" | "stopping" | "stopped";

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
  ipv6: string;
  region: string;
  vpcId: string;
  securityGroupIds: string[];
  keyPair: string;
  imageId: string;
  launchedAt: string;
};

export type Volume = {
  id: string;
  name: string;
  volumeType: string;
  sizeGiB: number;
  iops: number;
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
  state: "completed" | "pending";
  started: string;
  owner: string;
  region: string;
};

export type SecurityGroupRule = {
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
  blockPublicAccess: "off" | "on";
  ipv4Cidr: string;
  ipv6Cidr: string;
  region: string;
};

export type Subnet = {
  id: string;
  name: string;
  vpcId: string;
  state: "available" | "pending";
  ipv4Cidr: string;
  availableIps: number;
  availabilityZone: string;
  routeTableId: string;
  autoAssignPublicIp: boolean;
  region: string;
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
  snapshots: Snapshot[];
  securityGroups: SecurityGroup[];
  vpcs: Vpc[];
  subnets: Subnet[];
  routeTables: RouteTable[];
  internetGateways: InternetGateway[];
  elasticIps: ElasticIp[];
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

export type MachineImage = {
  id: string;
  name: string;
  version: string;
  mark: string;
  swatch: string;
  description: string;
  arch: string;
  boot: string;
  virtualization: string;
  ena: boolean;
  rootDevice: string;
  created: string;
  username: string;
  starter: boolean;
};

export type InstanceTypeOption = {
  id: string;
  family: string;
  vcpu: number;
  memoryGiB: number;
  currentGen: boolean;
  sampleHourly: string;
};

export type LaunchDraft = {
  name: string;
  tags: { key: string; value: string }[];
  imageId: string;
  instanceType: string;
  keyPair: string;
  vpcId: string;
  subnet: string;
  publicIp: boolean;
  firewall: "create" | "select";
  securityGroupId: string;
  allowSsh: boolean;
  sshCidr: string;
  allowHttps: boolean;
  allowHttp: boolean;
  volumeGiB: number;
  volumeType: string;
  count: number;
};
