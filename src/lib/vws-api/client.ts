import "server-only";
import { randomUUID } from "node:crypto";
import { headers as requestHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { currentSession } from "./session";
import { logAuth } from "./log";
import { iamMode, iamState, IamUnavailableError, noteLoginEnabled, type IamMode } from "./mode";
import { objectKeyProblem } from "@/lib/object-upload";
import { apiFetch, ApiTransportError, type ApiReply } from "./transport";
import { CSRF_COOKIE, SESSION_COOKIE, sessionFromSetCookie, type ApiSession } from "./session-cookies";
import type {
  ElasticIp,
  Instance,
  SecurityGroup,
  Snapshot,
  Subnet,
  Volume,
  VolumeAttachment,
  Vpc,
} from "@/types/console";
import {
  firstItem,
  parseAccountBuckets,
  parseAddresses,
  parseSecurityGroups,
  parseSnapshots,
  toAccountBucket,
  type AccountBucket,
  type BucketName,
  type IngressPermission,
  type ObjectContent,
  toObjectContent,
  nextPageToken,
  parseApiError,
  parseImages,
  parseKeyPairs,
  parseInstanceTypes,
  type InstanceType,
  parseInstances,
  parseOperation,
  parseSubnets,
  parseVolumes,
  parseVpcs,
  toInstance,
  toStoredKeyPair,
  toVolume,
  toVpc,
  type ApiError,
  type ApiResult,
  type Image,
  type LaunchRequest,
  type Operation,
} from "./adapter";
import {
  parseIdempotencyKey,
  parseKeyPairId,
  privateKeyFileName,
  readAttempt,
  type CreateAttempt,
  type IssuedKeyPair,
  type KeyPairCreateResult,
  type KeyPairDraft,
  type KeyPairId,
  type StoredKeyPair,
} from "@/lib/key-pair";

const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 60_000;

/** IAM off: the server-side bearer token, as before sign-in existed. It never reaches the browser. */
function bearer(): string | ApiError {
  const token = process.env.VWS_CONSOLE_API_TOKEN;
  if (token) return token;
  return { code: "ConsoleNotConfigured", message: "Set VWS_CONSOLE_API_TOKEN on the console server.", requestId: null };
}

/** The IAM mode, or the error to show when it is unknown or misconfigured. Never falls back to the token. */
async function modeOrError(): Promise<IamMode | ApiError> {
  try {
    return await iamMode();
  } catch (error) {
    if (error instanceof IamUnavailableError && error.state === "invalid") {
      return { code: "ConsoleNotConfigured", message: error.message, requestId: null };
    }
    return {
      code: "ServiceUnavailable",
      message: "The console could not tell whether sign-in is on; try again shortly.",
      requestId: null,
    };
  }
}

function apiBase(): string | ApiError {
  const base = process.env.VWS_CONSOLE_API_URL;
  if (base) return base.replace(/\/+$/, "");
  return { code: "ConsoleNotConfigured", message: "Set VWS_CONSOLE_API_URL on the console server.", requestId: null };
}

const unavailable: ApiError = {
  code: "ServiceUnavailable",
  message: "The VWS console API did not answer.",
  requestId: null,
};

function transportError(error: unknown): ApiError {
  if (error instanceof ApiTransportError) {
    return {
      code: error.kind === "timeout" ? "RequestTimeout" : "ServiceUnavailable",
      message: error.kind === "timeout" ? "The VWS console API did not answer in time." : unavailable.message,
      requestId: error.requestId,
    };
  }
  return unavailable;
}

function parseJson(text: string): unknown {
  return text ? JSON.parse(text) : null;
}

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
  const query = new URLSearchParams({
    ...(reason === "expired" ? { reason } : {}),
    ...(path ? { next: path } : {}),
  }).toString();
  redirect(query ? `${LOGIN_PATH}?${query}` : LOGIN_PATH);
}

/** On a failure, kind is the console-api error kind ("bucket", "object", …), or "" when it sent none. */
type RequestResult =
  | { ok: true; value: { status: number; json: unknown } }
  | { ok: false; status: number | null; kind?: string; error: ApiError };

type RawBody = { bytes: Uint8Array; contentType: string };

function blobBytes(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy]);
}

function rawBody(value: unknown): RawBody | null {
  if (typeof value !== "object" || value === null || !("bytes" in value)) return null;
  const bytes = (value as { bytes?: unknown }).bytes;
  const contentType = (value as { contentType?: unknown }).contentType;
  if (!(bytes instanceof Uint8Array) || typeof contentType !== "string") return null;
  return { bytes, contentType };
}

type PostOptions = { idempotencyKey?: string; bodyText?: string };

async function request(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  post?: PostOptions,
): Promise<RequestResult> {
  const base = apiBase();
  if (typeof base !== "string") return { ok: false, status: null, error: base };
  const mode = await modeOrError();
  if (typeof mode !== "string") return { ok: false, status: null, error: mode };
  const iam = mode === "on";
  const raw = method === "PUT" ? rawBody(body) : null;
  const headers: Record<string, string> = { accept: "application/json" };
  if (method !== "GET") {
    headers["content-type"] = raw
      ? iam
        ? "application/json"
        : raw.contentType || "application/octet-stream"
      : "application/json";
  }
  if (iam) {
    const session = await currentSession();
    if (!session) return toLogin("signin");
    headers.cookie = `${SESSION_COOKIE}=${session.session}; ${CSRF_COOKIE}=${session.csrf}`;
    if (method !== "GET") {
      headers["x-csrf-token"] = session.csrf;
      Object.assign(headers, await browserOrigin());
    }
  } else {
    const token = bearer();
    if (typeof token !== "string") return { ok: false, status: null, error: token };
    headers.authorization = `Bearer ${token}`;
  }
  if (method === "POST") {
    headers["idempotency-key"] = post?.idempotencyKey ?? randomUUID();
    headers["content-type"] = "application/json";
  }
  let response: ApiReply;
  let json: unknown;
  try {
    response = await apiFetch(`${base}/api/v1${path}`, {
      method,
      headers,
      body: method === "POST" ? (post?.bodyText ?? JSON.stringify(body ?? {})) : raw ? blobBytes(raw.bytes) : undefined,
    });
  } catch (error) {
    return { ok: false, status: null, error: transportError(error) };
  }
  try {
    json = parseJson(response.text);
  } catch {
    return { ok: false, status: response.status, error: { ...malformed(path), requestId: response.requestId } };
  }
  // With IAM off a 401 means a wrong token, which signing in cannot fix, so it is shown as an error.
  if (response.status === 401 && iam) return toLogin("expired");
  if (response.status < 200 || response.status > 299) {
    const kind = (json as { error?: { kind?: unknown } } | null)?.error?.kind;
    return {
      ok: false,
      status: response.status,
      kind: typeof kind === "string" ? kind : "",
      error: parseApiError(json) ?? {
        code: "InternalError",
        message: `The VWS console API answered HTTP ${response.status}.`,
        requestId: response.requestId,
      },
    };
  }
  return { ok: true, value: { status: response.status, json } };
}

function malformed(path: string): ApiError {
  return {
    code: "MalformedResponse",
    message: `The VWS console API sent an unreadable response for ${path}.`,
    requestId: null,
  };
}

function listQuery(path: string, pageSize: number | undefined, token: string): string {
  const params: string[] = [];
  if (pageSize !== undefined) params.push(`pageSize=${pageSize}`);
  if (token) params.push(`pageToken=${encodeURIComponent(token)}`);
  return params.length === 0 ? path : `${path}?${params.join("&")}`;
}

async function listAll<T>(path: string, parse: (page: unknown) => T[], pageSize?: number): Promise<ApiResult<T[]>> {
  const out: T[] = [];
  let token = "";
  do {
    const result = await request("GET", listQuery(path, pageSize, token));
    if (!result.ok) return { ok: false, error: result.error };
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
  if (!sent.ok) return { ok: false, error: sent.error };
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
      return {
        ok: false,
        error: { code: "OperationTimeout", message: `Operation ${op.id} is still running.`, requestId: null },
      };
    }
    await sleep(POLL_INTERVAL_MS);
    const polled = await request("GET", `/operations/${encodeURIComponent(op.id)}`);
    if (!polled.ok) return { ok: false, error: polled.error };
    try {
      op = parseOperation(polled.value.json);
    } catch {
      return { ok: false, error: malformed(`/operations/${op.id}`) };
    }
  }
  if (op.state === "failed") {
    return {
      ok: false,
      error: op.error ?? { code: "OperationFailed", message: `Operation ${op.id} failed.`, requestId: null },
    };
  }
  return { ok: true, value: sent.value.json };
}

const seg = encodeURIComponent;

export const listImages = (): Promise<ApiResult<Image[]>> => listAll("/images", parseImages);
export const listInstances = (): Promise<ApiResult<Instance[]>> => listAll("/instances", parseInstances);
export const listVolumes = (): Promise<ApiResult<Volume[]>> => listAll("/volumes", parseVolumes);
export const listVpcs = (): Promise<ApiResult<Vpc[]>> => listAll("/vpcs", parseVpcs);
export const listSubnets = (): Promise<ApiResult<Subnet[]>> => listAll("/subnets", parseSubnets);
export const listBuckets = (): Promise<ApiResult<AccountBucket[]>> => listAll("/buckets", parseAccountBuckets, 100);

/** console-api's generic codes as the S3 error codes and messages, as its own S3 surface maps them. */
const S3_ERRORS: Record<string, Record<string, { code: string; message: string }>> = {
  NotFound: {
    bucket: { code: "NoSuchBucket", message: "The specified bucket does not exist." },
    object: { code: "NoSuchKey", message: "The specified key does not exist." },
  },
  AlreadyExists: {
    bucket: {
      code: "BucketAlreadyExists",
      message: "The requested bucket name is not available. Select a different name and try again.",
    },
    object: { code: "PreconditionFailed", message: "An object with this key already exists." },
  },
  Conflict: { bucket: { code: "BucketNotEmpty", message: "The bucket you tried to delete is not empty." } },
  PayloadTooLarge: {
    object: { code: "EntityTooLarge", message: "Your proposed upload exceeds the maximum allowed object size." },
  },
};

function s3Failure(result: Extract<RequestResult, { ok: false }>, fallbackKind: "bucket" | "object"): ApiError {
  const byKind = S3_ERRORS[result.error.code];
  const mapped = byKind?.[result.kind || fallbackKind];
  return mapped ? { ...mapped, requestId: result.error.requestId } : result.error;
}

export async function putBucket(name: BucketName): Promise<ApiResult<AccountBucket>> {
  const path = `/buckets/${seg(name)}`;
  const result = await request("PUT", path);
  if (!result.ok) return { ok: false, error: s3Failure(result, "bucket") };
  if (result.value.status !== 200) return { ok: false, error: malformed(path) };
  try {
    return { ok: true, value: toAccountBucket(result.value.json, name) };
  } catch {
    return { ok: false, error: malformed(path) };
  }
}

export async function getBucket(name: BucketName): Promise<ApiResult<AccountBucket | null>> {
  const path = `/buckets/${seg(name)}`;
  const result = await request("GET", path);
  if (!result.ok) {
    if (result.status === 404 && result.error.code === "NotFound") return { ok: true, value: null };
    return { ok: false, error: s3Failure(result, "bucket") };
  }
  if (result.value.status !== 200) return { ok: false, error: malformed(path) };
  try {
    return { ok: true, value: toAccountBucket(result.value.json, name) };
  } catch {
    return { ok: false, error: malformed(path) };
  }
}

function objectPath(bucket: BucketName, key: string): string {
  return `/buckets/${seg(bucket)}/objects/${key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

function invalidKey(key: string): ApiError | null {
  const problem = objectKeyProblem(key);
  return problem ? { code: "InvalidArgument", message: problem, requestId: null } : null;
}

export async function putObject(
  bucket: BucketName,
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<ApiResult<void>> {
  const keyError = invalidKey(key);
  if (keyError) return { ok: false, error: keyError };
  const path = objectPath(bucket, key);
  const result = await request("PUT", path, { bytes, contentType });
  if (!result.ok) return { ok: false, error: s3Failure(result, "object") };
  if (result.value.status !== 200) return { ok: false, error: malformed(path) };
  const record = result.value.json;
  const got =
    typeof record === "object" && record !== null && "key" in record && typeof record.key === "string"
      ? record.key
      : "";
  if (got !== key) return { ok: false, error: malformed(path) };
  return { ok: true, value: undefined };
}

/** Reads one object with its bytes; console-api sends the bytes base64-encoded in `body`. */
export async function getObject(bucket: BucketName, key: string): Promise<ApiResult<ObjectContent>> {
  const keyError = invalidKey(key);
  if (keyError) return { ok: false, error: keyError };
  const path = objectPath(bucket, key);
  const result = await request("GET", path);
  if (!result.ok) return { ok: false, error: s3Failure(result, "object") };
  if (result.value.status !== 200) return { ok: false, error: malformed(path) };
  try {
    return { ok: true, value: toObjectContent(result.value.json, bucket, key) };
  } catch {
    return { ok: false, error: malformed(path) };
  }
}

/** Deletes one object. A missing key is already deleted, as S3 DeleteObject answers 204 for it. */
export async function deleteObject(bucket: BucketName, key: string): Promise<ApiResult<void>> {
  const keyError = invalidKey(key);
  if (keyError) return { ok: false, error: keyError };
  const path = objectPath(bucket, key);
  const result = await request("DELETE", path);
  if (!result.ok) {
    if (result.status === 404 && result.error.code === "NotFound" && result.kind === "object") {
      return { ok: true, value: undefined };
    }
    return { ok: false, error: s3Failure(result, "bucket") };
  }
  if (result.value.status !== 204) return { ok: false, error: malformed(path) };
  return { ok: true, value: undefined };
}

export async function deleteBucket(name: BucketName): Promise<ApiResult<void>> {
  const path = `/buckets/${seg(name)}`;
  const result = await request("DELETE", path);
  if (!result.ok) {
    if (result.status === 404 && result.error.code === "NotFound") return { ok: true, value: undefined };
    return { ok: false, error: s3Failure(result, "bucket") };
  }
  if (result.value.status !== 204) return { ok: false, error: malformed(path) };
  return { ok: true, value: undefined };
}

/** Reads one resource; a 404 is a missing resource, not an error. */
async function getOne<T>(path: string, map: (item: Record<string, unknown>) => T): Promise<ApiResult<T | null>> {
  const result = await request("GET", path);
  if (!result.ok) {
    return result.error.code === "NotFound" ? { ok: true, value: null } : { ok: false, error: result.error };
  }
  try {
    return { ok: true, value: map(result.value.json as Record<string, unknown>) };
  } catch {
    return { ok: false, error: malformed(path) };
  }
}

export const getInstance = (id: string): Promise<ApiResult<Instance | null>> =>
  getOne(`/instances/${seg(id)}`, toInstance);
export const getVpc = (id: string): Promise<ApiResult<Vpc | null>> => getOne(`/vpcs/${seg(id)}`, toVpc);
export const getVolume = (id: string): Promise<ApiResult<Volume | null>> => getOne(`/volumes/${seg(id)}`, toVolume);

export const launchInstances = ({ tags, keyPair, ...rest }: LaunchRequest) => {
  if (keyPair.kind !== "pair" && keyPair.kind !== "none") {
    return Promise.reject(new Error("Select a key pair or proceed without one."));
  }
  const named = keyPair.kind === "pair" ? { keyName: keyPair.name } : {};
  const body = { ...rest, ...named };
  return mutate("/instances", Object.keys(tags).length > 0 ? { ...body, tags } : body);
};

export const listKeyPairs = (): Promise<ApiResult<StoredKeyPair[]>> => listAll("/key-pairs", parseKeyPairs);

const invalidKeyPairId: ApiError = {
  code: "InvalidArgument",
  message: "Key pair id must be key- followed by 8 to 17 hex digits.",
  requestId: null,
};

function failedCreate(error: ApiError, issued: IssuedKeyPair | null): KeyPairCreateResult {
  return { status: "failed", error, issued };
}

function readCreateItem(json: unknown): { keyPair: StoredKeyPair; material: string } | null {
  const items = (json as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || items.length === 0) return null;
  const item = items[0];
  if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  try {
    return {
      keyPair: toStoredKeyPair(record),
      material: typeof record.keyMaterial === "string" ? record.keyMaterial : "",
    };
  } catch {
    return null;
  }
}

function privateFile(draft: KeyPairDraft, name: string, material: string): IssuedKeyPair["privateKey"] {
  if (!material) return null;
  const format = draft.mode === "generate" ? draft.keyFormat : "pem";
  return { fileName: privateKeyFileName(name, format), material, format };
}

export async function createKeyPair(attempt: CreateAttempt): Promise<KeyPairCreateResult> {
  const idempotencyKey = parseIdempotencyKey(attempt.idempotencyKey);
  if (!idempotencyKey) {
    return failedCreate(
      { code: "InvalidArgument", message: "The idempotency key is not valid.", requestId: null },
      null,
    );
  }
  const draft = readAttempt({ idempotencyKey, body: attempt.body });
  if ("code" in draft) return failedCreate(draft, null);
  const sent = await request("POST", "/key-pairs", undefined, { idempotencyKey, bodyText: attempt.body });
  if (!sent.ok) return failedCreate(sent.error, null);
  const read = readCreateItem(sent.value.json);
  if (!read || (draft.mode === "generate" && read.material === "")) return failedCreate(malformed("/key-pairs"), null);
  let issued: IssuedKeyPair = {
    keyPair: read.keyPair,
    privateKey: privateFile(draft, read.keyPair.name, read.material),
    settlement: "succeeded",
  };
  if (sent.value.status !== 202) return { status: "ready", issued };
  let op: Operation;
  try {
    op = parseOperation((sent.value.json as { operation?: unknown } | null)?.operation);
  } catch {
    return failedCreate(malformed("/key-pairs"), issued);
  }
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (op.state === "running") {
    if (Date.now() > deadline) return { status: "ready", issued: { ...issued, settlement: "still-running" } };
    await sleep(POLL_INTERVAL_MS);
    const polled = await request("GET", `/operations/${encodeURIComponent(op.id)}`);
    if (!polled.ok) return failedCreate(polled.error, issued);
    try {
      op = parseOperation(polled.value.json);
    } catch {
      return failedCreate(malformed(`/operations/${op.id}`), issued);
    }
  }
  if (op.state === "failed") {
    return failedCreate(
      op.error ?? { code: "OperationFailed", message: `Operation ${op.id} failed.`, requestId: null },
      issued,
    );
  }
  issued = { ...issued, settlement: "succeeded" };
  return { status: "ready", issued };
}

export async function deleteKeyPair(id: KeyPairId): Promise<ApiResult<void>> {
  const parsed = parseKeyPairId(id);
  if (!parsed) return { ok: false, error: invalidKeyPairId };
  return mutate(`/key-pairs/${seg(parsed)}/delete`);
}

/** console-api takes at most this many instance IDs in one batch call. */
export const INSTANCE_BATCH_LIMIT = 20;

/** Starts, stops or terminates instances with one operation per batch of up to 20 IDs. */
export async function instanceBatch(action: "start" | "stop" | "terminate", ids: string[]): Promise<ApiResult<void>> {
  for (let index = 0; index < ids.length; index += INSTANCE_BATCH_LIMIT) {
    const result = await mutate(`/instances/${action}`, {
      instanceIds: ids.slice(index, index + INSTANCE_BATCH_LIMIT),
    });
    if (!result.ok) return result;
  }
  return { ok: true, value: undefined };
}

/** Adds or overwrites tags on one instance; tags not named stay. */
export const createInstanceTags = (id: string, tags: Record<string, string>) =>
  mutate(`/instances/${seg(id)}/tags`, { tags });
export const createVolume = (size: number, volumeType: string) => mutate("/volumes", { size, volumeType });
export const deleteVolume = (id: string) => mutate(`/volumes/${seg(id)}/delete`);
export const createSnapshot = (volumeId: string, description: string) =>
  mutate("/snapshots", description ? { volumeId, description } : { volumeId });
const withTags = <T extends object>(body: T, tags: Record<string, string>) =>
  Object.keys(tags).length > 0 ? { ...body, tags } : body;

export const createVpc = (cidrBlock: string, tags: Record<string, string> = {}) =>
  mutate("/vpcs", withTags({ cidrBlock }, tags));
export const deleteVpc = (id: string) => mutate(`/vpcs/${seg(id)}/delete`);
export const createSubnet = (vpcId: string, cidrBlock: string, tags: Record<string, string> = {}) =>
  mutate("/subnets", withTags({ vpcId, cidrBlock }, tags));
/** Adds or overwrites tags on one VPC or subnet; tags not named stay. */
export const createVpcTags = (id: string, tags: Record<string, string>) => mutate(`/vpcs/${seg(id)}/tags`, { tags });
export const createSubnetTags = (id: string, tags: Record<string, string>) =>
  mutate(`/subnets/${seg(id)}/tags`, { tags });
export const deleteSubnet = (id: string) => mutate(`/subnets/${seg(id)}/delete`);

export const listInstanceTypes = (): Promise<ApiResult<InstanceType[]>> =>
  listAll("/instance-types", parseInstanceTypes);
/** console-api only grows a volume; it refuses a smaller size. */
export const modifyVolume = (id: string, size: number) => mutate(`/volumes/${seg(id)}/modify`, { size });

export async function attachVolume(volumeId: string, input: VolumeAttachment): Promise<ApiResult<void>> {
  const instanceId = input.instanceId.trim();
  const device = input.device.trim();
  if (!instanceId || !device) {
    return {
      ok: false,
      error: {
        code: "InvalidAttachment",
        message: "Choose an instance and a device name.",
        requestId: null,
      },
    };
  }
  return mutate(`/volumes/${seg(volumeId)}/attach`, { instanceId, device });
}

export function detachVolume(volumeId: string): Promise<ApiResult<void>> {
  return mutate(`/volumes/${seg(volumeId)}/detach`);
}

export const listSecurityGroups = (): Promise<ApiResult<SecurityGroup[]>> =>
  listAll("/security-groups", parseSecurityGroups);

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

/** Signs in with POST /auth/login and returns the session cookies console-api set. Never retried. */
export async function login(input: LoginInput): Promise<ApiResult<ApiSession>> {
  const mode = await modeOrError();
  if (typeof mode !== "string") return { ok: false, error: mode };
  if (mode === "off")
    return {
      ok: false,
      error: { code: "SignInDisabled", message: "Sign-in is off on this console.", requestId: null },
    };
  const base = apiBase();
  if (typeof base !== "string") return { ok: false, error: base };
  const started = performance.now();
  const done = (
    outcome: "success" | "failure" | "error",
    status: number | null,
    requestId: string | null,
    code?: string | null,
  ) => logAuth({ event: "auth.login", outcome, status, requestId, code, durationMs: performance.now() - started });
  let reply: ApiReply;
  try {
    reply = await apiFetch(`${base}/api/v1/auth/login`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", ...(await browserOrigin()) },
      body: JSON.stringify(
        input.mfaCode ? input : { account: input.account, userName: input.userName, password: input.password },
      ),
    });
  } catch (error) {
    const apiError = transportError(error);
    done("error", null, apiError.requestId, apiError.code);
    return { ok: false, error: apiError };
  }
  let json: unknown = null;
  try {
    json = parseJson(reply.text);
  } catch {
    json = null;
  }
  if (reply.status < 200 || reply.status > 299) {
    const apiError = parseApiError(json) ?? {
      code: "InternalError",
      message: `Sign-in answered HTTP ${reply.status}.`,
      requestId: reply.requestId,
    };
    done(reply.status >= 500 ? "error" : "failure", reply.status, reply.requestId, apiError.code);
    return { ok: false, error: apiError };
  }
  const session = sessionFromSetCookie(reply.headers.getSetCookie());
  if (!session) {
    done("error", reply.status, reply.requestId, "MalformedResponse");
    return { ok: false, error: malformed("/auth/login") };
  }
  noteLoginEnabled(json);
  done("success", reply.status, reply.requestId);
  return { ok: true, value: session };
}

/** Revokes the session with POST /auth/logout. A missing or expired session is already signed out. Never retried. */
export async function logout(): Promise<void> {
  const base = apiBase();
  const session = (await iamState()) === "on" ? await currentSession() : null;
  const started = performance.now();
  if (typeof base !== "string" || !session) {
    logAuth({
      event: "auth.logout",
      outcome: "skipped",
      status: null,
      requestId: null,
      durationMs: performance.now() - started,
    });
    return;
  }
  try {
    const reply = await apiFetch(`${base}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${SESSION_COOKIE}=${session.session}; ${CSRF_COOKIE}=${session.csrf}`,
        "x-csrf-token": session.csrf,
        ...(await browserOrigin()),
      },
      body: "{}",
    });
    const ok = reply.status >= 200 && reply.status <= 299;
    logAuth({
      event: "auth.logout",
      outcome: ok ? "success" : "failure",
      status: reply.status,
      requestId: reply.requestId,
      durationMs: performance.now() - started,
    });
  } catch (error) {
    // The console still drops its cookies; the API session then expires on its own.
    const apiError = transportError(error);
    logAuth({
      event: "auth.logout",
      outcome: "error",
      status: null,
      requestId: apiError.requestId,
      code: apiError.code,
      durationMs: performance.now() - started,
    });
  }
}

export type SessionInfo = { principal: string; account: string; root: boolean; expiresAt: string };

export async function getSession(): Promise<ApiResult<SessionInfo>> {
  const result = await request("GET", "/auth/session");
  if (!result.ok) return { ok: false, error: result.error };
  const body = (result.value.json ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    ok: true,
    value: {
      principal: text(body.principal),
      account: text(body.account),
      root: body.root === true,
      expiresAt: text(body.expiresAt),
    },
  };
}

/**
 * The signed-in session for display, without redirecting: null when console-api is not configured,
 * there is no session, or it no longer answers. Pages still redirect through their own calls.
 */
export async function signedInSession(): Promise<SessionInfo | null> {
  const state = await iamState();
  if (state !== "on" && state !== "off") return null;
  const iam = state === "on";
  const base = apiBase();
  if (typeof base !== "string") return null;
  let credentials: Record<string, string>;
  if (iam) {
    const session = await currentSession();
    if (!session) return null;
    credentials = { cookie: `${SESSION_COOKIE}=${session.session}; ${CSRF_COOKIE}=${session.csrf}` };
  } else {
    // IAM off: the bearer is the account root; console-api reports its account the same way.
    const token = bearer();
    if (typeof token !== "string") return null;
    credentials = { authorization: `Bearer ${token}` };
  }
  const started = performance.now();
  try {
    const reply = await apiFetch(`${base}/api/v1/auth/session`, {
      headers: { accept: "application/json", ...credentials },
    });
    const ok = reply.status >= 200 && reply.status <= 299;
    logAuth({
      event: "auth.session",
      outcome: ok ? "success" : reply.status >= 500 ? "error" : "failure",
      status: reply.status,
      requestId: reply.requestId,
      attempts: reply.attempts,
      durationMs: performance.now() - started,
    });
    if (!ok) return null;
    const body = (parseJson(reply.text) ?? {}) as Record<string, unknown>;
    noteLoginEnabled(body);
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    return {
      principal: text(body.principal),
      account: text(body.account),
      root: body.root === true,
      expiresAt: text(body.expiresAt),
    };
  } catch (error) {
    const apiError = transportError(error);
    logAuth({
      event: "auth.session",
      outcome: "error",
      status: null,
      requestId: apiError.requestId,
      code: apiError.code,
      durationMs: performance.now() - started,
    });
    return null;
  }
}
