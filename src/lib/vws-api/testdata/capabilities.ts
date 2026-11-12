import { parseCapabilities } from "../adapter";

/** Capability documents as GET /regions/{region}/capabilities sends them (console-api internal/resource). */

const MUTATIONS = [
  "RunInstances",
  "StartInstances",
  "StopInstances",
  "RebootInstances",
  "TerminateInstances",
  "CreateTags",
  "DeleteTags",
  "CreateVolume",
  "AttachVolume",
  "DetachVolume",
  "DeleteVolume",
  "ModifyVolume",
  "CreateSnapshot",
  "DeleteSnapshot",
  "CreateKeyPair",
  "DeleteKeyPair",
  "CreateVpc",
  "DeleteVpc",
  "CreateSubnet",
  "DeleteSubnet",
  "CreateSecurityGroup",
  "DeleteSecurityGroup",
  "AuthorizeSecurityGroupIngress",
  "RevokeSecurityGroupIngress",
  "AllocateAddress",
  "ReleaseAddress",
  "AssociateAddress",
  "DisassociateAddress",
  "RegisterImage",
];

const READS = [
  "DescribeInstances",
  "DescribeImages",
  "DescribeVolumes",
  "DescribeSnapshots",
  "DescribeKeyPairs",
  "DescribeVpcs",
  "DescribeSubnets",
  "DescribeSecurityGroups",
  "DescribeAddresses",
];

const every = (names: string[], capability: Record<string, string>) =>
  Object.fromEntries(names.map((name) => [`ec2:${name}`, capability]));

const supported = { state: "supported" };
const limits = { maxInstancesPerRun: 0, maxTagsPerResource: 0, maxUserDataBytes: 0, maxVolumesPerInstance: 0 };
const small = { instanceType: "vws.small", vcpus: 1, memoryMiB: 1024 };
const medium = { instanceType: "vws.medium", vcpus: 2, memoryMiB: 4096 };

/** The phase-one Proxmox backend on the 8 GB live box: reads only, and the two instance types that fit a node. */
export const pveLiveBox = {
  region: "pve-lab-1",
  kind: "proxmox",
  cluster: { name: "lab", pveRelease: "", quorate: false, leader: "" },
  zones: [{ zoneName: "pve-lab-1a", zoneId: "pve-lab-1a", state: "available", nodes: ["pve"] }],
  actions: {
    ...every(MUTATIONS, { state: "unsupported", reasonCode: "ReadOnly", reason: "read-only" }),
    ...every(READS, { state: "empty" }),
    ...every(["DescribeInstances", "DescribeVolumes", "DescribeSnapshots", "DescribeTags"], supported),
    ...every(["DescribeVpcs", "DescribeSubnets"], {
      state: "partial",
      reasonCode: "BridgeInventory",
      reason: "bridge inventory; SDN inventory is not yet served",
    }),
    "ec2:DescribeRouteTables": { state: "empty" },
  },
  instanceTypes: [small, medium],
  limits,
  features: { userData: false, linkedClones: false, snapshotScope: "vm", privateIpMode: "", liveTests: true },
};

/** A Proxmox region that takes writes, with the partial and unsupported entries of design.md 3.2.4. */
export const pveWritable = {
  ...pveLiveBox,
  actions: {
    ...pveLiveBox.actions,
    ...every(MUTATIONS, supported),
    "ec2:CreateVolume": {
      state: "partial",
      reasonCode: "NoSnapshotSource",
      reason: "pve-lab-1 does not create volumes from snapshots",
    },
    "ec2:AllocateAddress": {
      state: "unsupported",
      reasonCode: "NoElasticIP",
      reason: "pve-lab-1 does not support Elastic IP",
    },
  },
};

/** An AWS region: console-api declares every action supported and every read but instances empty. */
export const awsRegion = {
  region: "ap-northeast-2",
  kind: "aws",
  zones: [],
  actions: {
    "vws:OpenConsole": supported,
    ...every(MUTATIONS, supported),
    ...every(READS, { state: "empty", reasonCode: "InventoryNotImplemented", reason: "AWS read is not implemented" }),
    "ec2:DescribeInstances": supported,
  },
  instanceTypes: [
    small,
    medium,
    { instanceType: "vws.large", vcpus: 4, memoryMiB: 8192 },
    { instanceType: "vws.xlarge", vcpus: 8, memoryMiB: 16384 },
  ],
  limits,
  features: { userData: false, linkedClones: false, snapshotScope: "", privateIpMode: "", liveTests: false },
};

/** The document as the root layout hands it to ConsoleProvider. */
export const loaded = (doc: unknown) => ({ ok: true as const, value: parseCapabilities(doc) });
