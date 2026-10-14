import type { ElasticIp, Instance, InstanceState, SecurityGroup, SecurityGroupRule, Snapshot, Subnet, Volume, Vpc } from "@/types/console";

export const REGION = "vws-1";

export type ApiError = { code: string; message: string; requestId: string | null };

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };

export type OperationState = "running" | "succeeded" | "failed";

export type Operation = { id: string; state: OperationState; error: ApiError | null };

type Json = Record<string, unknown>;

function obj(value: unknown): Json {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function list(page: unknown): Json[] {
  const items = obj(page).items;
  // console-api encodes an empty list as null.
  if (items === null) return [];
  if (!Array.isArray(items)) throw new Error("expected items");
  return items.map(obj);
}

export function nextPageToken(page: unknown): string {
  return str(obj(page).nextPageToken);
}

/** Reads `{"error":{"code","message"},"requestId"}`. Returns null for any other body. */
export function parseApiError(body: unknown): ApiError | null {
  const error = obj(obj(body).error);
  const code = str(error.code);
  if (!code) return null;
  return { code, message: str(error.message), requestId: str(obj(body).requestId) || null };
}

export function parseOperation(body: unknown): Operation {
  const op = obj(body);
  const state = str(op.state);
  if (state !== "running" && state !== "succeeded" && state !== "failed") throw new Error(`unknown operation state ${state}`);
  const error = op.error ? obj(op.error) : null;
  return {
    id: str(op.id),
    state,
    error: error ? { code: str(error.code) || "OperationFailed", message: str(error.message), requestId: null } : null,
  };
}

const instanceStates: readonly InstanceState[] = ["pending", "running", "stopping", "stopped", "shutting-down", "terminated"];

function instanceState(name: string): InstanceState {
  const found = instanceStates.find((state) => state === name);
  if (!found) throw new Error(`unknown instance state ${name}`);
  return found;
}

export function toInstance(item: Json): Instance {
  return {
    id: str(item.instanceId),
    name: str(obj(item.tags).Name),
    state: instanceState(str(item.state)),
    type: str(item.instanceType),
    status: "none",
    checksPassed: 0,
    checksTotal: 0,
    availabilityZone: str(item.availabilityZone),
    publicDns: "",
    publicIpv4: "",
    privateIpv4: str(item.privateIpAddress),
    privateDns: "",
    elasticIp: "",
    ipv6: "",
    region: REGION,
    vpcId: "",
    subnetId: str(item.subnetId),
    securityGroupIds: [],
    keyPair: "",
    imageId: str(item.imageId),
    launchedAt: "",
  };
}

export function toVolume(item: Json): Volume {
  return {
    id: str(item.volumeId),
    name: "",
    state: str(item.state),
    volumeType: str(item.volumeType),
    sizeGiB: typeof item.size === "number" ? item.size : 0,
    iops: null,
    throughput: "",
    owner: str(item.ownerId),
    snapshotId: str(item.snapshotId),
    sourceVolumeId: "",
    created: str(item.createTime),
    availabilityZone: str(item.availabilityZone),
    region: REGION,
    attachedTo: str(item.instanceId),
  };
}

export function toVpc(item: Json): Vpc {
  return {
    id: str(item.vpcId),
    name: "",
    state: str(item.state) === "available" ? "available" : "pending",
    encryption: "",
    encryptionControl: "",
    blockPublicAccess: "",
    ipv4Cidr: str(item.cidrBlock),
    ipv6Cidr: "",
    owner: str(item.ownerId),
    isDefault: null,
    region: REGION,
  };
}

export function toSubnet(item: Json): Subnet {
  return {
    id: str(item.subnetId),
    name: "",
    vpcId: str(item.vpcId),
    state: str(item.state) === "available" ? "available" : "pending",
    ipv4Cidr: str(item.cidrBlock),
    availableIps: null,
    availabilityZone: "",
    routeTableId: "",
    autoAssignPublicIp: null,
    region: REGION,
  };
}

export const parseInstances = (page: unknown) => list(page).map(toInstance);
export const parseVolumes = (page: unknown) => list(page).map(toVolume);
export const parseVpcs = (page: unknown) => list(page).map(toVpc);
export const parseSubnets = (page: unknown) => list(page).map(toSubnet);

/** Joins each instance's subnet to its VPC, since the API returns only subnetId. */
export function withVpcIds(instances: Instance[], subnets: Subnet[]): Instance[] {
  const vpcOf = new Map(subnets.map((subnet) => [subnet.id, subnet.vpcId]));
  return instances.map((instance) => ({ ...instance, vpcId: vpcOf.get(instance.subnetId) ?? "" }));
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const protocolLabels: Record<string, string> = { "-1": "All", tcp: "TCP", udp: "UDP", icmp: "ICMP" };

/** console-api reports ingress rules only, without rule IDs or descriptions. */
export function toIngressRule(item: Json): SecurityGroupRule {
  const protocol = str(item.ipProtocol);
  const label = protocolLabels[protocol] ?? protocol.toUpperCase();
  const from = num(item.fromPort);
  const to = num(item.toPort);
  const port = label === "All" || label === "ICMP" || from === null ? "All" : from === to || to === null ? String(from) : `${from}-${to}`;
  return { id: "", direction: "in", protocol: label, port, source: str(item.cidrIp), description: "" };
}

export function toSecurityGroup(item: Json): SecurityGroup {
  const permissions = Array.isArray(item.ipPermissions) ? item.ipPermissions.map(obj) : [];
  return {
    id: str(item.groupId),
    name: "",
    groupName: str(item.groupName),
    vpcId: str(item.vpcId),
    description: "",
    owner: str(item.ownerId),
    region: REGION,
    rules: permissions.map(toIngressRule),
  };
}

export type IngressPermission = { ipProtocol: string; fromPort: number; toPort: number; cidrIp: string };

/** Maps a console rule onto one authorize-ingress body, or explains why the API cannot take it. */
export function toIngressPermission(rule: SecurityGroupRule): { ok: true; value: IngressPermission } | { ok: false; error: string } {
  const protocol = Object.entries(protocolLabels).find(([, label]) => label === rule.protocol)?.[0];
  if (!protocol) return { ok: false, error: `The VWS API does not take protocol ${rule.protocol}.` };
  if (rule.source.startsWith("sg-")) return { ok: false, error: "The VWS API only takes CIDR sources, not security group IDs." };
  let fromPort = 0;
  let toPort = 0;
  if (protocol === "tcp" || protocol === "udp") {
    const match = /^(\d+)(?:-(\d+))?$/.exec(rule.port);
    if (!match) return { ok: false, error: `Port range ${rule.port} is not a port or a range.` };
    fromPort = Number(match[1]);
    toPort = match[2] === undefined ? fromPort : Number(match[2]);
  }
  return { ok: true, value: { ipProtocol: protocol, fromPort, toPort, cidrIp: rule.source } };
}

export function toAddress(item: Json): ElasticIp {
  return {
    allocationId: str(item.allocationId),
    name: "",
    address: str(item.publicIp),
    instanceId: str(item.instanceId),
    privateIp: "",
    owner: str(item.ownerId),
    region: REGION,
  };
}

export function toSnapshot(item: Json): Snapshot {
  return {
    id: str(item.snapshotId),
    name: "",
    volumeId: str(item.volumeId),
    sizeGiB: num(item.volumeSize) ?? 0,
    description: str(item.description),
    state: str(item.state),
    started: "",
    owner: str(item.ownerId),
    region: REGION,
  };
}

export const parseSecurityGroups = (page: unknown) => list(page).map(toSecurityGroup);
export const parseAddresses = (page: unknown) => list(page).map(toAddress);
export const parseSnapshots = (page: unknown) => list(page).map(toSnapshot);

/** Reads the first item of a 202 mutation response, which carries the new resource. */
export function firstItem(body: unknown, key: string): string {
  const items = obj(body).items;
  return Array.isArray(items) && items.length > 0 ? str(obj(items[0])[key]) : "";
}
