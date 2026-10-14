import "server-only";
import { randomUUID } from "node:crypto";
import type { ElasticIp, Instance, SecurityGroup, Snapshot, Subnet, Volume, Vpc } from "@/types/console";
import {
  firstItem,
  parseAddresses,
  parseSecurityGroups,
  parseSnapshots,
  type IngressPermission,
  nextPageToken,
  parseApiError,
  parseImages,
  parseInstanceTypes,
  type InstanceType,
  parseInstances,
  parseOperation,
  parseSubnets,
  parseVolumes,
  parseVpcs,
  toInstance,
  type ApiError,
  type ApiResult,
  type Image,
  type LaunchRequest,
} from "./adapter";

const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 60_000;

type Config = { base: string; token: string };

function config(): Config | ApiError {
  const base = process.env.VWS_CONSOLE_API_URL;
  const token = process.env.VWS_CONSOLE_API_TOKEN;
  if (base && token) return { base: base.replace(/\/+$/, ""), token };
  const missing = [!base && "VWS_CONSOLE_API_URL", !token && "VWS_CONSOLE_API_TOKEN"].filter(Boolean).join(", ");
  return { code: "ConsoleNotConfigured", message: `Set ${missing} on the console server.`, requestId: null };
}

const unavailable: ApiError = { code: "ServiceUnavailable", message: "The VWS console API did not answer.", requestId: null };

async function request(method: "GET" | "POST", path: string, body?: unknown): Promise<ApiResult<{ status: number; json: unknown }>> {
  const cfg = config();
  if ("code" in cfg) return { ok: false, error: cfg };
  const headers: Record<string, string> = { authorization: `Bearer ${cfg.token}`, accept: "application/json" };
  if (method === "POST") {
    headers["idempotency-key"] = randomUUID();
    headers["content-type"] = "application/json";
  }
  let response: Response;
  let json: unknown;
  try {
    response = await fetch(`${cfg.base}/api/v1${path}`, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      cache: "no-store",
    });
    const text = await response.text();
    json = text ? JSON.parse(text) : null;
  } catch {
    return { ok: false, error: unavailable };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: parseApiError(json) ?? { code: "InternalError", message: `The VWS console API answered HTTP ${response.status}.`, requestId: null },
    };
  }
  return { ok: true, value: { status: response.status, json } };
}

function malformed(path: string): ApiError {
  return { code: "MalformedResponse", message: `The VWS console API sent an unreadable response for ${path}.`, requestId: null };
}

async function listAll<T>(path: string, parse: (page: unknown) => T[]): Promise<ApiResult<T[]>> {
  const out: T[] = [];
  let token = "";
  do {
    const result = await request("GET", token ? `${path}?pageToken=${encodeURIComponent(token)}` : path);
    if (!result.ok) return result;
    try {
      out.push(...parse(result.value.json));
    } catch {
      return { ok: false, error: malformed(path) };
    }
    token = nextPageToken(result.value.json);
  } while (token);
  return { ok: true, value: out };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Sends a mutation. A 202 carries an operation, which is polled until it finishes. */
async function mutate(path: string, body?: unknown): Promise<ApiResult<void>> {
  const result = await mutateReturning(path, body);
  return result.ok ? { ok: true, value: undefined } : result;
}

/** Like mutate, but returns the body of the accepted request, which names the new resource. */
async function mutateReturning(path: string, body?: unknown): Promise<ApiResult<unknown>> {
  const sent = await request("POST", path, body);
  if (!sent.ok) return sent;
  if (sent.value.status !== 202) return { ok: true, value: sent.value.json };
  let op;
  try {
    op = parseOperation((sent.value.json as { operation?: unknown } | null)?.operation);
  } catch {
    return { ok: false, error: malformed(path) };
  }
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (op.state === "running") {
    if (Date.now() > deadline) {
      return { ok: false, error: { code: "OperationTimeout", message: `Operation ${op.id} is still running.`, requestId: null } };
    }
    await sleep(POLL_INTERVAL_MS);
    const polled = await request("GET", `/operations/${encodeURIComponent(op.id)}`);
    if (!polled.ok) return polled;
    try {
      op = parseOperation(polled.value.json);
    } catch {
      return { ok: false, error: malformed(`/operations/${op.id}`) };
    }
  }
  if (op.state === "failed") {
    return { ok: false, error: op.error ?? { code: "OperationFailed", message: `Operation ${op.id} failed.`, requestId: null } };
  }
  return { ok: true, value: sent.value.json };
}

const seg = encodeURIComponent;

export const listImages = (): Promise<ApiResult<Image[]>> => listAll("/images", parseImages);
export const listInstances = (): Promise<ApiResult<Instance[]>> => listAll("/instances", parseInstances);
export const listVolumes = (): Promise<ApiResult<Volume[]>> => listAll("/volumes", parseVolumes);
export const listVpcs = (): Promise<ApiResult<Vpc[]>> => listAll("/vpcs", parseVpcs);
export const listSubnets = (): Promise<ApiResult<Subnet[]>> => listAll("/subnets", parseSubnets);

export async function getInstance(id: string): Promise<ApiResult<Instance | null>> {
  const result = await request("GET", `/instances/${seg(id)}`);
  if (!result.ok) return result.error.code === "NotFound" ? { ok: true, value: null } : result;
  try {
    return { ok: true, value: toInstance(result.value.json as Record<string, unknown>) };
  } catch {
    return { ok: false, error: malformed(`/instances/${id}`) };
  }
}

export const launchInstances = ({ tags, ...rest }: LaunchRequest) =>
  mutate("/instances", Object.keys(tags).length > 0 ? { ...rest, tags } : rest);
export const startInstance = (id: string) => mutate(`/instances/${seg(id)}/start`);
export const stopInstance = (id: string) => mutate(`/instances/${seg(id)}/stop`);
export const terminateInstance = (id: string) => mutate(`/instances/${seg(id)}/terminate`);
export const createVolume = (size: number, volumeType: string) => mutate("/volumes", { size, volumeType });
export const deleteVolume = (id: string) => mutate(`/volumes/${seg(id)}/delete`);
export const createSnapshot = (volumeId: string, description: string) =>
  mutate("/snapshots", description ? { volumeId, description } : { volumeId });
export const createVpc = (cidrBlock: string) => mutate("/vpcs", { cidrBlock });
export const deleteVpc = (id: string) => mutate(`/vpcs/${seg(id)}/delete`);
export const createSubnet = (vpcId: string, cidrBlock: string) => mutate("/subnets", { vpcId, cidrBlock });
export const deleteSubnet = (id: string) => mutate(`/subnets/${seg(id)}/delete`);

export const listInstanceTypes = (): Promise<ApiResult<InstanceType[]>> => listAll("/instance-types", parseInstanceTypes);
/** console-api only grows a volume; it refuses a smaller size. */
export const modifyVolume = (id: string, size: number) => mutate(`/volumes/${seg(id)}/modify`, { size });

export const listSecurityGroups = (): Promise<ApiResult<SecurityGroup[]>> => listAll("/security-groups", parseSecurityGroups);

export async function createSecurityGroup(groupName: string, vpcId: string): Promise<ApiResult<string>> {
  const result = await mutateReturning("/security-groups", { groupName, vpcId });
  if (!result.ok) return result;
  const id = firstItem(result.value, "groupId");
  return id ? { ok: true, value: id } : { ok: false, error: malformed("/security-groups") };
}

export const authorizeIngress = (groupId: string, ipPermissions: IngressPermission) =>
  mutate(`/security-groups/${seg(groupId)}/authorize-ingress`, { ipPermissions });
export const deleteSecurityGroup = (id: string) => mutate(`/security-groups/${seg(id)}/delete`);

export const listAddresses = (): Promise<ApiResult<ElasticIp[]>> => listAll("/addresses", parseAddresses);
export const allocateAddress = () => mutate("/addresses", {});
export const associateAddress = (allocationId: string, instanceId: string) =>
  mutate(`/addresses/${seg(allocationId)}/associate`, { instanceId });
export const disassociateAddress = (allocationId: string) => mutate(`/addresses/${seg(allocationId)}/disassociate`);
export const releaseAddress = (allocationId: string) => mutate(`/addresses/${seg(allocationId)}/release`);

export const listSnapshots = (): Promise<ApiResult<Snapshot[]>> => listAll("/snapshots", parseSnapshots);
export const deleteSnapshot = (id: string) => mutate(`/snapshots/${seg(id)}/delete`);
