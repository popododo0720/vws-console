import { parseKeyPairId, parseKeyPairName, type KeyPairChoice, type StoredKeyPair } from "@/lib/key-pair";
import { normalizeCidr } from "@/lib/security-group-rules";
import type {
  ElasticIp,
  IngressPermission,
  Instance,
  InstanceState,
  SecurityGroup,
  SecurityGroupRule,
  Snapshot,
  Subnet,
  Volume,
  Vpc,
} from "@/types/console";

/** console-api has one Availability Zone and refuses any other (vws-console-api internal/resource/text.go ZoneName). */
export const ZONES = ["vws-1a"] as const;

export type ApiError = { code: string; message: string; requestId: string | null; field?: string };

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };

/** The X-Vws-Region value that reads every registered region at once. */
export const ALL_REGIONS = "all";

export const regionLabel = (region: string) => (region === ALL_REGIONS ? "All regions" : region);

/** One region as GET /regions lists it. `kind` is "pve" or "aws"; the console decides nothing by it. */
export type Region = { name: string; kind: string; state: "available" | "degraded" | "unavailable" };

declare const brand: unique symbol;

export type BucketName = string & { readonly [brand]: "BucketName" };

/** `region` is set when console-api names the region the bucket is in. */
export type AccountBucket = { name: BucketName; ownerId: string; created: string; region?: string };

/** One stored object as console-api describes it, without its bytes. */
export type StoredObject = {
  bucket: BucketName;
  key: string;
  size: number;
  contentType: string;
  lastModified: string;
  etag: string;
};

export type ObjectContent = StoredObject & { bytes: Uint8Array };

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

/** console-api's own rule for a region name, so a listed name that breaks it never reaches a request header. */
const REGION_NAME = /^[a-z0-9-]{1,63}$/;
const REGION_STATES = ["available", "degraded", "unavailable"] as const;

/** A state the console does not know is shown as unavailable. */
export function parseRegions(page: unknown): Region[] {
  return list(page).flatMap((item) => {
    const name = str(item.name);
    if (!REGION_NAME.test(name) || name === ALL_REGIONS) return [];
    return [
      { name, kind: str(item.kind), state: REGION_STATES.find((state) => state === item.state) ?? "unavailable" },
    ];
  });
}

/**
 * The region a page works in: its ?region= when that is All regions or a listed name, else the first listed one.
 * The server and the browser both decide with this, so the menu names the region the requests were sent to.
 */
export function pickRegion(regions: readonly Region[], choice: string | null): string | null {
  if (choice === ALL_REGIONS || regions.some((region) => region.name === choice)) return choice;
  return regions[0]?.name ?? null;
}

const BUCKET_NAME = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const RESERVED_PREFIX = ["xn--", "sthree-", "amzn-s3-demo-"] as const;
const RESERVED_SUFFIX = ["-s3alias", "--ol-s3", "--x-s3", "--table-s3"] as const;

export function parseStoredBucketName(input: string): BucketName | null {
  const name = input.trim();
  return BUCKET_NAME.test(name) ? (name as BucketName) : null;
}

export function reservedBucketName(name: BucketName): boolean {
  return (
    RESERVED_PREFIX.some((prefix) => name.startsWith(prefix)) || RESERVED_SUFFIX.some((suffix) => name.endsWith(suffix))
  );
}

export function parseBucketName(input: string): BucketName | null {
  const name = parseStoredBucketName(input);
  if (!name || reservedBucketName(name)) return null;
  return name;
}

export function toAccountBucket(item: unknown, expected?: BucketName): AccountBucket {
  const record = obj(item);
  const name = parseStoredBucketName(typeof record.name === "string" ? record.name : "");
  if (!name) throw new Error("invalid bucket name");
  if (expected !== undefined && name !== expected) throw new Error("unexpected bucket name");
  const created = record.creationDate;
  if (typeof created !== "string" || created.length === 0) throw new Error("invalid creationDate");
  const region = str(record.region);
  return {
    name,
    ownerId: typeof record.ownerId === "string" ? record.ownerId : "",
    created,
    ...(region && { region }),
  };
}

/** A flat character class, not a repeated group: a grouped pattern overflows the regex stack on a 4 MiB body. */
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

function decodeBase64(text: string): Uint8Array {
  if (text.length % 4 !== 0 || !BASE64.test(text)) throw new Error("invalid base64 body");
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Reads a GET object reply. It must name the requested bucket and key, and its size must match its bytes. */
export function toObjectContent(item: unknown, bucket: BucketName, key: string): ObjectContent {
  const record = obj(item);
  if (record.bucket !== bucket || record.key !== key) throw new Error("unexpected object");
  const size = record.size;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0) throw new Error("invalid size");
  const bytes = decodeBase64(record.body === null || record.body === undefined ? "" : str(record.body));
  if (bytes.byteLength !== size) throw new Error("size does not match body");
  return {
    bucket,
    key,
    size,
    contentType: str(record.contentType),
    lastModified: str(record.lastModified),
    etag: str(record.etag),
    bytes,
  };
}

export function parseAccountBuckets(page: unknown): AccountBucket[] {
  const items = obj(page).items;
  if (!Array.isArray(items)) throw new Error("expected items");
  return items.map((item) => toAccountBucket(item));
}

export function parseApiError(body: unknown): ApiError | null {
  const error = obj(obj(body).error);
  const code = str(error.code);
  if (!code) return null;
  const field = str(error.field);
  const requestId = str(obj(body).requestId) || null;
  return { code, message: str(error.message), requestId, ...(field ? { field } : {}) };
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
    region: str(item.region),
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
    iops: num(item.iops),
    throughput: num(item.throughput) === null ? "" : String(item.throughput),
    owner: str(item.ownerId),
    snapshotId: str(item.snapshotId),
    sourceVolumeId: "",
    created: str(item.createTime),
    availabilityZone: str(item.availabilityZone),
    region: str(item.region),
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
    region: str(item.region),
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
    blockPublicAccess: "",
    tags: tags(item.tags),
    region: str(item.region),
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

/** console-api reports ingress rules only, without rule IDs or descriptions. The stored values are kept for revoke. */
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
  const permission = { ipProtocol: protocol, fromPort: from ?? 0, toPort: to ?? from ?? 0, cidrIp: str(item.cidrIp) };
  return { id: "", direction: "in", protocol: label, port, source: permission.cidrIp, description: "", permission };
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
    region: str(item.region),
    rules: permissions.map(toIngressRule),
  };
}

/** Maps a console rule onto one authorize-ingress body, or explains why the API cannot take it. */
export function toIngressPermission(
  rule: SecurityGroupRule,
): { ok: true; value: IngressPermission } | { ok: false; error: string } {
  const protocol = Object.entries(protocolLabels).find(([, label]) => label === rule.protocol)?.[0];
  if (!protocol) return { ok: false, error: `The VWS API does not take protocol ${rule.protocol}.` };
  if (rule.source.startsWith("sg-"))
    return { ok: false, error: "The VWS API only takes CIDR sources, not security group IDs." };
  let fromPort = 0;
  let toPort = 0;
  if (protocol === "tcp" || protocol === "udp") {
    const match = /^(\d+)(?:-(\d+))?$/.exec(rule.port);
    if (!match) return { ok: false, error: `Port range ${rule.port} is not a port or a range.` };
    fromPort = Number(match[1]);
    toPort = match[2] === undefined ? fromPort : Number(match[2]);
  }
  const cidrIp = normalizeCidr(rule.source);
  if (!cidrIp) return { ok: false, error: `Source ${rule.source} is not an IPv4 CIDR block.` };
  return { ok: true, value: { ipProtocol: protocol, fromPort, toPort, cidrIp } };
}

export function toAddress(item: Json): ElasticIp {
  return {
    allocationId: str(item.allocationId),
    name: "",
    address: str(item.publicIp),
    instanceId: str(item.instanceId),
    privateIp: "",
    owner: str(item.ownerId),
    region: str(item.region),
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
    region: str(item.region),
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
    created: str(item.createTime),
    ...(str(item.region) && { region: str(item.region) }),
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

/** One registered Proxmox cluster (vws-console-api internal/admin/store Region). tokenSecret is secretLabel's text. */
export type AdminRegion = {
  name: string;
  clusterName: string;
  pveApiUrl: string;
  caPem: string;
  tokenId: string;
  tokenSecret: string;
  regionEndpoint: string;
  zones: { letter: string; nodes: string[] }[];
};

export type Versioned<T> = T & { etag: string };

export type AdminRegionInput = Omit<AdminRegion, "tokenSecret"> & { tokenSecret?: string };

export type ConnectionStep = { name: string; result: string; message: string };

/** A live reading of GET /admin/regions/{name}/health; "unknown" is the console's status for one it did not get. */
export type AdminRegionHealth = {
  status: "ok" | "unreachable" | "unknown";
  quorate: boolean;
  leader: string;
  nodes: { name: string; online: boolean }[];
  lastError: { time: string; message: string } | null;
  checkedAt: string;
};

export type AdminAwsAccount = { id: string; allowedRegions: string[] };

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function objects(value: unknown): Json[] {
  return Array.isArray(value) ? value.map(obj) : [];
}

/**
 * A write-only secret as the console shows it: "Set" and the first 8 hex digits of its SHA-256, which is all
 * console-api describes. Nothing else passes, so a secret value it must never send cannot reach a page.
 */
function secretLabel(value: unknown): string {
  const fingerprint = str(obj(value).fingerprint);
  if (obj(value).set !== true) return "Not set";
  return /^[0-9a-f]{8}$/.test(fingerprint) ? `Set · ${fingerprint}` : "Set";
}

export function toAdminRegion(item: Json): AdminRegion {
  const name = str(item.name);
  if (!name) throw new Error("region name");
  return {
    name,
    clusterName: str(item.clusterName),
    pveApiUrl: str(item.pveApiUrl),
    caPem: str(item.caPem),
    tokenId: str(item.tokenId),
    tokenSecret: secretLabel(item.tokenSecret),
    regionEndpoint: str(item.regionEndpoint),
    zones: objects(item.zones).map((zone) => ({ letter: str(zone.letter), nodes: strings(zone.nodes) })),
  };
}

export function toAdminRegionHealth(item: Json): AdminRegionHealth {
  const status = str(item.status);
  if (status !== "ok" && status !== "unreachable") throw new Error(`unknown region status ${status}`);
  const lastError = item.lastError ? obj(item.lastError) : null;
  return {
    status,
    quorate: item.quorate === true,
    leader: str(item.leader),
    nodes: objects(item.nodes).map((node) => ({ name: str(node.name), online: node.online === true })),
    lastError: lastError ? { time: str(lastError.time), message: str(lastError.message) } : null,
    checkedAt: str(item.checkedAt),
  };
}

/** The reading shown when console-api returned none: why, with the code and request ID an operator can quote. */
export function unknownHealth(error: ApiError): AdminRegionHealth {
  const message = `${error.message} (${error.code} · Request ID ${error.requestId ?? "—"})`;
  return { status: "unknown", quorate: false, leader: "", nodes: [], lastError: { time: "", message }, checkedAt: "" };
}

/** A server action can be called with any JSON, so only the region fields pass, each read as text. */
export function toAdminRegionInput(form: unknown, secret: unknown): AdminRegionInput {
  const text = (key: string) => str(obj(form)[key]).trim();
  const names = (value: unknown) => str(value).match(/[^\s,]+/g) ?? [];
  const tokenSecret = str(secret);
  return {
    name: text("name"),
    clusterName: text("clusterName"),
    pveApiUrl: text("pveApiUrl"),
    caPem: text("caPem"),
    tokenId: text("tokenId"),
    regionEndpoint: text("regionEndpoint"),
    zones: objects(obj(form).zones).map((zone) => ({ letter: str(zone.letter).trim(), nodes: names(zone.nodes) })),
    ...(tokenSecret ? { tokenSecret } : {}),
  };
}

export function parseConnectionSteps(body: unknown): ConnectionStep[] {
  const steps = obj(body).steps;
  if (!Array.isArray(steps)) throw new Error("expected steps");
  return steps.map(obj).map((step) => ({ name: str(step.name), result: str(step.result), message: str(step.message) }));
}

export const parseAdminRegions = (page: unknown) => list(page).map(toAdminRegion);
export const parseAdminAwsAccounts = (page: unknown): AdminAwsAccount[] =>
  list(page).map((item) => ({ id: str(item.awsAccountId), allowedRegions: strings(item.allowedRegions) }));

export function parseAdminPermissions(body: unknown): string[] {
  const permissions = obj(body).permissions;
  if (!Array.isArray(permissions)) throw new Error("expected permissions");
  return strings(permissions);
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
