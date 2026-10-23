import { parseKeyPairId, parseKeyPairName, type KeyPairChoice, type StoredKeyPair } from "@/lib/key-pair";
import type {
  ElasticIp,
  Instance,
  InstanceState,
  SecurityGroup,
  SecurityGroupRule,
  Snapshot,
  Subnet,
  Volume,
  Vpc,
} from "@/types/console";

export const REGION = "vws-1";

export type ApiError = { code: string; message: string; requestId: string | null };

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };

export type OperationState = "running" | "succeeded" | "failed";

export type Image = { id: string; name: string; state: string; owner: string };

/** Machine types vws-compute accepts (console-api resource/instance.go). The API has no list endpoint. */
export type InstanceType = { id: string; vcpus: number; memoryMiB: number };

export type LaunchRequest = {
  imageId: string;
  instanceType: string;
  subnetId: string;
  count: number;
  tags: Record<string, string>;
  keyPair: KeyPairChoice;
};

export type Operation = { id: string; state: OperationState; error: ApiError | null };

type Json = Record<string, unknown>;

function obj(value: unknown): Json {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : {};
}

/** A missing flag stays null so the console shows a dash. */
function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** Reads a tags object, keeping string values only. */
function tags(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(obj(value)).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function list(page: unknown): Json[] {
  const items = obj(page).items;
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
  if (state !== "running" && state !== "succeeded" && state !== "failed")
    throw new Error(`unknown operation state ${state}`);
  const error = op.error ? obj(op.error) : null;
  return {
    id: str(op.id),
    state,
    error: error ? { code: str(error.code) || "OperationFailed", message: str(error.message), requestId: null } : null,
  };
}

const instanceStates: readonly InstanceState[] = [
  "pending",
  "running",
  "stopping",
  "stopped",
  "shutting-down",
  "terminated",
];

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
    publicIpv4: str(item.publicIpAddress),
    privateIpv4: str(item.privateIpAddress),
    privateDns: "",
    elasticIp: str(item.publicIpAllocationId) ? str(item.publicIpAddress) : "",
    publicIpAllocationId: str(item.publicIpAllocationId),
    ipv6: "",
    region: REGION,
    vpcId: str(item.vpcId),
    subnetId: str(item.subnetId),
    keyPair: str(item.keyName),
    imageId: str(item.imageId),
    launchedAt: str(item.launchTime),
  };
}

export function toVolume(item: Json): Volume {
  const instanceId = str(item.instanceId);
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
    attachment: instanceId ? { instanceId, device: str(item.device) } : null,
  };
}

export function toVpc(item: Json): Vpc {
  return {
    id: str(item.vpcId),
    name: str(obj(item.tags).Name),
    state: str(item.state) === "available" ? "available" : "pending",
    encryption: "",
    encryptionControl: "",
    blockPublicAccess: "",
    ipv4Cidr: str(item.cidrBlock),
    ipv6Cidr: "",
    owner: str(item.ownerId),
    isDefault: bool(item.isDefault),
    tags: tags(item.tags),
    region: REGION,
  };
}

export function toSubnet(item: Json): Subnet {
  return {
    id: str(item.subnetId),
    name: str(obj(item.tags).Name),
    vpcId: str(item.vpcId),
    state: str(item.state) === "available" ? "available" : "pending",
    ipv4Cidr: str(item.cidrBlock),
    availableIps: null,
    availabilityZone: str(item.availabilityZone),
    routeTableId: "",
    autoAssignPublicIp: bool(item.mapPublicIpOnLaunch),
    tags: tags(item.tags),
    region: REGION,
  };
}

export function toImage(item: Json): Image {
  return { id: str(item.imageId), name: str(item.name), state: str(item.state), owner: str(item.ownerId) };
}

export const parseImages = (page: unknown) => list(page).map(toImage);
export const parseInstances = (page: unknown) => list(page).map(toInstance);
export const parseVolumes = (page: unknown) => list(page).map(toVolume);
export const parseVpcs = (page: unknown) => list(page).map(toVpc);
export const parseSubnets = (page: unknown) => list(page).map(toSubnet);

export function toInstanceType(item: Json): InstanceType {
  return {
    id: str(item.instanceType),
    vcpus: typeof item.vcpus === "number" ? item.vcpus : 0,
    memoryMiB: typeof item.memoryMiB === "number" ? item.memoryMiB : 0,
  };
}

export const parseInstanceTypes = (page: unknown) => list(page).map(toInstanceType);

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
  const port =
    label === "All" || label === "ICMP" || from === null
      ? "All"
      : from === to || to === null
        ? String(from)
        : `${from}-${to}`;
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

type Described = { description?: string };

/** One AWS EC2 IpPermission, in the camelCase the console API takes. */
export type IpPermission = {
  ipProtocol: string;
  fromPort?: number;
  toPort?: number;
  ipRanges?: ({ cidrIp: string } & Described)[];
  ipv6Ranges?: ({ cidrIpv6: string } & Described)[];
  userIdGroupPairs?: ({ groupId: string } & Described)[];
  prefixListIds?: ({ prefixListId: string } & Described)[];
};

/**
 * Maps a console rule onto one AWS IpPermission, or explains why it is not a rule.
 * The API decides which sources and descriptions it can store; this only shapes the request.
 */
export function toIpPermission(
  rule: SecurityGroupRule,
): { ok: true; value: IpPermission } | { ok: false; error: string } {
  const ipProtocol = Object.entries(protocolLabels).find(([, label]) => label === rule.protocol)?.[0];
  if (!ipProtocol) return { ok: false, error: `The VWS API does not take protocol ${rule.protocol}.` };
  const permission: IpPermission = { ipProtocol };
  if (ipProtocol === "tcp" || ipProtocol === "udp") {
    const match = /^(\d+)(?:-(\d+))?$/.exec(rule.port);
    if (!match) return { ok: false, error: `Port range ${rule.port} is not a port or a range.` };
    permission.fromPort = Number(match[1]);
    permission.toPort = match[2] === undefined ? permission.fromPort : Number(match[2]);
  } else if (ipProtocol === "icmp") {
    // AWS spells "all ICMP types and codes" as type -1 and code -1.
    permission.fromPort = -1;
    permission.toPort = -1;
  }
  const description = rule.description.trim();
  const described: Described = description ? { description } : {};
  if (rule.source.startsWith("sg-")) permission.userIdGroupPairs = [{ groupId: rule.source, ...described }];
  else permission.ipRanges = [{ cidrIp: rule.source, ...described }];
  return { ok: true, value: permission };
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

export function toStoredKeyPair(item: Record<string, unknown>): StoredKeyPair {
  const id = parseKeyPairId(str(item.keyPairId));
  const name = parseKeyPairName(str(item.keyName));
  if (!id || !name) throw new Error("key pair");
  return {
    id,
    name,
    fingerprint: str(item.keyFingerprint),
    type: str(item.keyType),
    ownerId: str(item.ownerId),
  };
}

export function parseKeyPairs(page: unknown): StoredKeyPair[] {
  return list(page).map(toStoredKeyPair);
}

/** Reads the first item of a 202 mutation response, which carries the new resource. */
export function firstItem(body: unknown, key: string): string {
  const items = obj(body).items;
  return Array.isArray(items) && items.length > 0 ? str(obj(items[0])[key]) : "";
}

/** The signed-in user and account shown in the account menu. A missing field is "—", like the rest of the console. */
export type Identity = { userName: string; accountId: string };

/** Maps GET /auth/session to the menu identity: the user name is the last part of the principal ARN. */
export function identityFromSession(
  session: { principal?: string; account?: string } | null,
  mode: { iam: boolean } = { iam: true },
): Identity {
  if (!mode.iam) return { userName: "root (IAM off)", accountId: session?.account?.trim() || "—" };
  const principal = session?.principal?.trim() ?? "";
  const resource = principal.slice(principal.lastIndexOf(":") + 1);
  const userName = resource.slice(resource.lastIndexOf("/") + 1);
  return { userName: userName || "—", accountId: session?.account?.trim() || "—" };
}
