import "server-only";
import { randomUUID } from "node:crypto";
import { headers as requestHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { currentSession } from "./session";
import { CSRF_COOKIE, SESSION_COOKIE, sessionFromSetCookie, type ApiSession } from "./session-cookies";
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
  toVolume,
  toVpc,
  type ApiError,
  type ApiResult,
  type Image,
  type LaunchRequest,
} from "./adapter";

const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 60_000;

function apiBase(): string | ApiError {
  const base = process.env.VWS_CONSOLE_API_URL;
  if (base) return base.replace(/\/+$/, "");
  return { code: "ConsoleNotConfigured", message: "Set VWS_CONSOLE_API_URL on the console server.", requestId: null };
}

const unavailable: ApiError = { code: "ServiceUnavailable", message: "The VWS console API did not answer.", requestId: null };

/** Where a request with no session, or one console-api answers 401, is sent. */
export const LOGIN_PATH = "/login";

/** Header the proxy sets with the page being rendered, so a 401 can come back to it after sign-in. */
export const PATH_HEADER = "x-vws-path";

/**
 * The browser's Origin for a write. console-api (PR #137) refuses cookie writes and sign-in without an
 * allowed Origin, so the console forwards the one the browser sent; Next has already checked it against
 * the console host for server actions. Run console-api with -console-origins set to the console origin.
 */
async function browserOrigin(): Promise<Record<string, string>> {
  const origin = (await requestHeaders()).get("origin");
  return origin ? { origin } : {};
}

async function toLogin(reason: "signin" | "expired"): Promise<never> {
  const path = (await requestHeaders()).get(PATH_HEADER);
  const query = new URLSearchParams({ ...(reason === "expired" ? { reason } : {}), ...(path ? { next: path } : {}) }).toString();
  redirect(query ? `${LOGIN_PATH}?${query}` : LOGIN_PATH);
}

/**
 * Calls console-api as the signed-in user. The session cookie is forwarded from this server only,
 * and every write carries X-CSRF-Token. A missing session or a 401 redirects to the login screen.
 */
async function request(method: "GET" | "POST", path: string, body?: unknown): Promise<ApiResult<{ status: number; json: unknown }>> {
  const base = apiBase();
  if (typeof base !== "string") return { ok: false, error: base };
  const session = await currentSession();
  if (!session) return toLogin("signin");
  const headers: Record<string, string> = {
    accept: "application/json",
    cookie: `${SESSION_COOKIE}=${session.session}; ${CSRF_COOKIE}=${session.csrf}`,
  };
  if (method === "POST") {
    headers["idempotency-key"] = randomUUID();
    headers["content-type"] = "application/json";
    headers["x-csrf-token"] = session.csrf;
    Object.assign(headers, await browserOrigin());
  }
  let response: Response;
  let json: unknown;
  try {
    response = await fetch(`${base}/api/v1${path}`, {
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
  if (response.status === 401) return toLogin("expired");
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

/** Reads one resource; a 404 is a missing resource, not an error. */
async function getOne<T>(path: string, map: (item: Record<string, unknown>) => T): Promise<ApiResult<T | null>> {
  const result = await request("GET", path);
  if (!result.ok) return result.error.code === "NotFound" ? { ok: true, value: null } : result;
  try {
    return { ok: true, value: map(result.value.json as Record<string, unknown>) };
  } catch {
    return { ok: false, error: malformed(path) };
  }
}

export const getInstance = (id: string): Promise<ApiResult<Instance | null>> => getOne(`/instances/${seg(id)}`, toInstance);
export const getVpc = (id: string): Promise<ApiResult<Vpc | null>> => getOne(`/vpcs/${seg(id)}`, toVpc);
export const getVolume = (id: string): Promise<ApiResult<Volume | null>> => getOne(`/volumes/${seg(id)}`, toVolume);

export const launchInstances = ({ tags, ...rest }: LaunchRequest) =>
  mutate("/instances", Object.keys(tags).length > 0 ? { ...rest, tags } : rest);
/** console-api takes at most this many instance IDs in one batch call. */
export const INSTANCE_BATCH_LIMIT = 20;

/** Starts, stops or terminates instances with one operation per batch of up to 20 IDs. */
export async function instanceBatch(action: "start" | "stop" | "terminate", ids: string[]): Promise<ApiResult<void>> {
  for (let index = 0; index < ids.length; index += INSTANCE_BATCH_LIMIT) {
    const result = await mutate(`/instances/${action}`, { instanceIds: ids.slice(index, index + INSTANCE_BATCH_LIMIT) });
    if (!result.ok) return result;
  }
  return { ok: true, value: undefined };
}

/** Adds or overwrites tags on one instance; tags not named stay. */
export const createInstanceTags = (id: string, tags: Record<string, string>) => mutate(`/instances/${seg(id)}/tags`, { tags });
export const createVolume = (size: number, volumeType: string) => mutate("/volumes", { size, volumeType });
export const deleteVolume = (id: string) => mutate(`/volumes/${seg(id)}/delete`);
export const createSnapshot = (volumeId: string, description: string) =>
  mutate("/snapshots", description ? { volumeId, description } : { volumeId });
const withTags = <T extends object>(body: T, tags: Record<string, string>) => (Object.keys(tags).length > 0 ? { ...body, tags } : body);

export const createVpc = (cidrBlock: string, tags: Record<string, string> = {}) => mutate("/vpcs", withTags({ cidrBlock }, tags));
export const deleteVpc = (id: string) => mutate(`/vpcs/${seg(id)}/delete`);
export const createSubnet = (vpcId: string, cidrBlock: string, tags: Record<string, string> = {}) =>
  mutate("/subnets", withTags({ vpcId, cidrBlock }, tags));
/** Adds or overwrites tags on one VPC or subnet; tags not named stay. */
export const createVpcTags = (id: string, tags: Record<string, string>) => mutate(`/vpcs/${seg(id)}/tags`, { tags });
export const createSubnetTags = (id: string, tags: Record<string, string>) => mutate(`/subnets/${seg(id)}/tags`, { tags });
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

export type LoginInput = { account: string; userName: string; password: string; mfaCode?: string };

/** Signs in with POST /auth/login and returns the session cookies console-api set. */
export async function login(input: LoginInput): Promise<ApiResult<ApiSession>> {
  const base = apiBase();
  if (typeof base !== "string") return { ok: false, error: base };
  let response: Response;
  let json: unknown = null;
  try {
    response = await fetch(`${base}/api/v1/auth/login`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", ...(await browserOrigin()) },
      body: JSON.stringify(input.mfaCode ? input : { account: input.account, userName: input.userName, password: input.password }),
      cache: "no-store",
    });
    const text = await response.text();
    json = text ? JSON.parse(text) : null;
  } catch {
    return { ok: false, error: unavailable };
  }
  if (!response.ok) {
    return { ok: false, error: parseApiError(json) ?? { code: "InternalError", message: `Sign-in answered HTTP ${response.status}.`, requestId: null } };
  }
  const session = sessionFromSetCookie(response.headers.getSetCookie());
  return session ? { ok: true, value: session } : { ok: false, error: malformed("/auth/login") };
}

/** Revokes the session with POST /auth/logout. A missing or expired session is already signed out. */
export async function logout(): Promise<void> {
  const base = apiBase();
  const session = await currentSession();
  if (typeof base !== "string" || !session) return;
  try {
    await fetch(`${base}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${SESSION_COOKIE}=${session.session}; ${CSRF_COOKIE}=${session.csrf}`,
        "x-csrf-token": session.csrf,
        ...(await browserOrigin()),
      },
      body: "{}",
      cache: "no-store",
    });
  } catch {
    // The console still drops its cookies; the API session then expires on its own.
  }
}

export type SessionInfo = { principal: string; account: string; root: boolean; expiresAt: string };

export async function getSession(): Promise<ApiResult<SessionInfo>> {
  const result = await request("GET", "/auth/session");
  if (!result.ok) return result;
  const body = (result.value.json ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return { ok: true, value: { principal: text(body.principal), account: text(body.account), root: body.root === true, expiresAt: text(body.expiresAt) } };
}

/**
 * The signed-in session for display, without redirecting: null when console-api is not configured,
 * there is no session, or it no longer answers. Pages still redirect through their own calls.
 */
export async function signedInSession(): Promise<SessionInfo | null> {
  const base = apiBase();
  const session = await currentSession();
  if (typeof base !== "string" || !session) return null;
  try {
    const response = await fetch(`${base}/api/v1/auth/session`, {
      headers: { accept: "application/json", cookie: `${SESSION_COOKIE}=${session.session}; ${CSRF_COOKIE}=${session.csrf}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = ((await response.json()) ?? {}) as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    return { principal: text(body.principal), account: text(body.account), root: body.root === true, expiresAt: text(body.expiresAt) };
  } catch {
    return null;
  }
}
