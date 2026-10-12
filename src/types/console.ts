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

export type BucketKind = "general" | "directory";

export type Bucket = {
  name: string;
  region: string;
  created: string;
  kind: BucketKind;
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
  buckets: Bucket[];
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
