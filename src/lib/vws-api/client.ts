import "server-only";
import { randomUUID } from "node:crypto";
import { cache } from "react";
import { headers as requestHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { currentSession } from "./session";
import { logAuth } from "./log";
import { iamMode, iamState, IamUnavailableError, noteLoginEnabled, type IamMode } from "./mode";
import { recordOperationPoll } from "@/lib/ops/metrics";
import { withSpan } from "@/lib/ops/span";
import { objectKeyProblem } from "@/lib/object-upload";
import { DEVICE_NAME, type CreateSnapshotInput, type CreateVolumeInput } from "@/lib/ebs";
import { apiFetch, ApiTransportError, timeoutMs, type ApiReply } from "./transport";
import { keyPath, route, withQuery, type ApiRoute } from "./route";
import { API_SESSION_COOKIE, CSRF_COOKIE, sessionFromSetCookie, type ApiSession } from "./session-cookies";
import type {
  ElasticIp,
  IngressPermission,
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
  type ObjectContent,
  type StoredObject,
  toObjectContent,
  nextPageToken,
  parseApiError,
  parseImages,
  parseKeyPairs,
  parseInstanceTypes,
  type InstanceType,
  parseInstances,
  parseOperation,
  parseRegions,
  parseSubnets,
  parseVolumes,
  parseVpcs,
  pickRegion,
  toInstance,
  toStoredKeyPair,
  toVolume,
  toVpc,
  parseAdminAwsAccounts,
  parseAdminPermissions,
  parseAdminRegions,
  parseConnectionSteps,
  toAdminRegion,
  toAdminRegionHealth,
  unknownHealth,
  type AdminAwsAccount,
  type AdminRegion,
  type AdminRegionHealth,
  type AdminRegionInput,
  type ApiError,
  type ApiResult,
  type ConnectionStep,
  type Versioned,
  type Image,
  type LaunchRequest,
  type Operation,
  type Region,
} from "./adapter";
import {
  parseIdempotencyKey,
  parseKeyPairId,
  privateKeyFileName,
  readAttempt,
  type CreateAttempt,
  type IdempotencyKey,
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
  | { ok: true; value: { status: number; json: unknown; etag: string } }
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

type PostOptions = {
  idempotencyKey?: string;
  bodyText?: string;
  ifMatch?: string;
  timeoutMs?: number;
  region?: string | null;
};

/**
 * The X-Vws-Region value for the page being served: its ?region= when console-api lists that name, else the first
 * region it lists. Null when it lists none, or outside a page; console-api then uses its own default region.
 */
async function regionHeader(): Promise<string | null> {
  const path = (await requestHeaders()).get(PATH_HEADER);
  if (path === null) return null;
  const regions = await listRegions();
  const query = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
  return pickRegion(regions.ok ? regions.value : [], new URLSearchParams(query).get("region"));
}

async function request(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: ApiRoute,
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
    headers.cookie = `${API_SESSION_COOKIE}=${session.session}; ${CSRF_COOKIE}=${session.csrf}`;
    if (method !== "GET") {
      headers["x-csrf-token"] = session.csrf;
      Object.assign(headers, await browserOrigin());
    }
  } else {
    const token = bearer();
    if (typeof token !== "string") return { ok: false, status: null, error: token };
    headers.authorization = `Bearer ${token}`;
  }
  const region = post?.region === undefined ? await regionHeader() : post.region;
  if (region) headers["x-vws-region"] = region;
  if (method === "POST") {
    headers["idempotency-key"] = post?.idempotencyKey ?? randomUUID();
    headers["content-type"] = "application/json";
  }
  if (post?.ifMatch) headers["if-match"] = post.ifMatch;
  const sendsJson = method === "POST" || method === "PATCH";
  let response: ApiReply;
  let json: unknown;
  try {
    response = await apiFetch(
      base,
      path,
      {
        method,
        headers,
        body: sendsJson ? (post?.bodyText ?? JSON.stringify(body ?? {})) : raw ? blobBytes(raw.bytes) : undefined,
      },
      { iamMode: mode, timeoutMs: post?.timeoutMs },
    );
  } catch (error) {
    return { ok: false, status: null, error: transportError(error) };
  }
  try {
    json = parseJson(response.text);
  } catch {
    return { ok: false, status: response.status, error: { ...malformed(path.path), requestId: response.requestId } };
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
  return { ok: true, value: { status: response.status, json, etag: response.headers.get("etag") ?? "" } };
}

function malformed(path: string): ApiError {
  return {
    code: "MalformedResponse",
    message: `The VWS console API sent an unreadable response for ${path}.`,
    requestId: null,
  };
}

async function listAll<T>(path: ApiRoute, parse: (page: unknown) => T[], pageSize?: number): Promise<ApiResult<T[]>> {
  const out: T[] = [];
  let token = "";
  const region = await regionHeader();
  do {
    const result = await request("GET", withQuery(path, { pageSize, pageToken: token }), undefined, { region });
    if (!result.ok) return { ok: false, error: result.error };
    try {
      out.push(...parse(result.value.json));
    } catch {
      return { ok: false, error: malformed(path.path) };
    }
    token = nextPageToken(result.value.json);
  } while (token);
  return { ok: true, value: out };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reads GET /operations/{id} every 500 ms until the operation leaves "running" or 60 s pass. A "running"
 * operation back means the deadline passed; callers decide what that means for them.
 */
async function pollOperation(op: Operation, region: string | null): Promise<ApiResult<Operation>> {
  const started = performance.now();
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  try {
    while (op.state === "running") {
      if (Date.now() > deadline) return { ok: true, value: op };
      await sleep(POLL_INTERVAL_MS);
      const polled = await request("GET", route("/operations/{id}", { id: op.id }), undefined, { region });
      if (!polled.ok) return { ok: false, error: polled.error };
      try {
        op = parseOperation(polled.value.json);
      } catch {
        return { ok: false, error: malformed(`/operations/${op.id}`) };
      }
    }
    return { ok: true, value: op };
  } finally {
    recordOperationPoll((performance.now() - started) / 1000);
  }
}

/** Sends a mutation. A 202 carries an operation, which is polled until it finishes. */
async function mutate(path: ApiRoute, body?: unknown, idempotencyKey?: IdempotencyKey): Promise<ApiResult<void>> {
  const result = await mutateReturning(path, body, idempotencyKey);
  return result.ok ? { ok: true, value: undefined } : result;
}

/** Like mutate, but returns the body of the accepted request, which names the new resource. */
async function mutateReturning(
  path: ApiRoute,
  body?: unknown,
  idempotencyKey?: IdempotencyKey,
): Promise<ApiResult<unknown>> {
  const region = await regionHeader();
  const sent = await request("POST", path, body, { idempotencyKey, region });
  if (!sent.ok) return { ok: false, error: sent.error };
  if (sent.value.status !== 202) return { ok: true, value: sent.value.json };
  let accepted;
  try {
    accepted = parseOperation((sent.value.json as { operation?: unknown } | null)?.operation);
  } catch {
    return { ok: false, error: malformed(path.path) };
  }
  const polled = await pollOperation(accepted, region);
  if (!polled.ok) return polled;
  const op = polled.value;
  if (op.state === "running") {
    return {
      ok: false,
      error: { code: "OperationTimeout", message: `Operation ${op.id} is still running.`, requestId: null },
    };
  }
  if (op.state === "failed") {
    return {
      ok: false,
      error: op.error ?? { code: "OperationFailed", message: `Operation ${op.id} failed.`, requestId: null },
    };
  }
  return { ok: true, value: sent.value.json };
}

/** With no console-api the console runs on its sample data, in the one region console-api's own fake backend lists. */
const sampleRegions: Region[] = [{ name: "vws-1", kind: "pve", state: "available" }];

/** Read once for a page render. A server action reads it again for each operation it starts. */
export const listRegions = cache(async (): Promise<ApiResult<Region[]>> => {
  if (typeof apiBase() !== "string") return { ok: true, value: sampleRegions };
  const path = route("/regions");
  const result = await request("GET", path, undefined, { region: null });
  if (!result.ok) return { ok: false, error: result.error };
  try {
    return { ok: true, value: parseRegions(result.value.json) };
  } catch {
    return { ok: false, error: malformed(path.path) };
  }
});

export const listImages = (): Promise<ApiResult<Image[]>> => listAll(route("/images"), parseImages);
export const listInstances = (): Promise<ApiResult<Instance[]>> => listAll(route("/instances"), parseInstances);
export const listVolumes = (): Promise<ApiResult<Volume[]>> => listAll(route("/volumes"), parseVolumes);
export const listVpcs = (): Promise<ApiResult<Vpc[]>> => listAll(route("/vpcs"), parseVpcs);
export const listSubnets = (): Promise<ApiResult<Subnet[]>> => listAll(route("/subnets"), parseSubnets);
export const listBuckets = (): Promise<ApiResult<AccountBucket[]>> =>
  listAll(route("/buckets"), parseAccountBuckets, 100);

/** The S3 call a failure came from; a few console-api codes mean different S3 errors per call. */
type S3Call = "createBucket" | "headBucket" | "deleteBucket" | "putObject" | "getObject" | "deleteObject";

/**
 * console-api's texts for the two bucket-create errors its S3 surface refines
 * (vws-console-api `resource/error.go` BucketOwnedMessage and BucketDeletingMessage,
 * `surface/s3rest` s3Refinement). The JSON surface sends no flag, only the text.
 */
const BUCKET_OWNED_MESSAGE = "Your previous request to create the named bucket succeeded and you already own it.";
const BUCKET_DELETING_MESSAGE =
  "A conflicting conditional action is currently in progress against this resource. Try again.";

const NO_SUCH_BUCKET = { code: "NoSuchBucket", message: "The specified bucket does not exist." };
const NO_SUCH_KEY = { code: "NoSuchKey", message: "The specified key does not exist." };

/**
 * console-api's generic codes as the S3 error codes and messages, as its own S3
 * surface maps them (awscode S3Default/S3ByKind plus s3Refinement). A code with
 * no S3 meaning for the call passes through unchanged.
 */
function s3Error(code: string, kind: string, message: string, call: S3Call): { code: string; message: string } | null {
  const onObject = kind === "object";
  switch (code) {
    case "NotFound":
      return onObject ? NO_SUCH_KEY : NO_SUCH_BUCKET;
    case "AlreadyExists":
      if (onObject) return { code: "PreconditionFailed", message: "An object with this key already exists." };
      if (message === BUCKET_OWNED_MESSAGE) return { code: "BucketAlreadyOwnedByYou", message };
      return {
        code: "BucketAlreadyExists",
        message: "The requested bucket name is not available. Select a different name and try again.",
      };
    case "Conflict":
      if (onObject) return null;
      if (message === BUCKET_DELETING_MESSAGE) return { code: "OperationAborted", message };
      if (call === "deleteBucket")
        return { code: "BucketNotEmpty", message: "The bucket you tried to delete is not empty." };
      if (call === "createBucket") return { code: "OperationAborted", message: message || BUCKET_DELETING_MESSAGE };
      return null;
    case "IdempotencyMismatch":
      return { code: "OperationAborted", message: message || BUCKET_DELETING_MESSAGE };
    case "PayloadTooLarge":
      return call === "putObject"
        ? { code: "EntityTooLarge", message: "Your proposed upload exceeds the maximum allowed object size." }
        : { code: "EntityTooLarge", message: message || "The object is too large for this console to download." };
    default:
      return null;
  }
}

function s3Failure(result: Extract<RequestResult, { ok: false }>, call: S3Call): ApiError {
  // A delete-object failure without a kind is about the bucket, as before.
  const fallbackKind = call === "putObject" || call === "getObject" ? "object" : "bucket";
  const mapped = s3Error(result.error.code, result.kind || fallbackKind, result.error.message, call);
  return mapped ? { ...mapped, requestId: result.error.requestId } : result.error;
}

export async function putBucket(name: BucketName): Promise<ApiResult<AccountBucket>> {
  const path = route("/buckets/{name}", { name });
  const result = await request("PUT", path);
  if (!result.ok) return { ok: false, error: s3Failure(result, "createBucket") };
  if (result.value.status !== 200) return { ok: false, error: malformed(path.path) };
  try {
    return { ok: true, value: toAccountBucket(result.value.json, name) };
  } catch {
    return { ok: false, error: malformed(path.path) };
  }
}

export async function getBucket(name: BucketName): Promise<ApiResult<AccountBucket | null>> {
  const path = route("/buckets/{name}", { name });
  const result = await request("GET", path);
  if (!result.ok) {
    if (result.status === 404 && result.error.code === "NotFound") return { ok: true, value: null };
    return { ok: false, error: s3Failure(result, "headBucket") };
  }
  if (result.value.status !== 200) return { ok: false, error: malformed(path.path) };
  try {
    return { ok: true, value: toAccountBucket(result.value.json, name) };
  } catch {
    return { ok: false, error: malformed(path.path) };
  }
}

function objectPath(bucket: BucketName, key: string): ApiRoute {
  return route("/buckets/{name}/objects/{key}", { name: bucket, key: keyPath(key) });
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
  if (!result.ok) return { ok: false, error: s3Failure(result, "putObject") };
  if (result.value.status !== 200) return { ok: false, error: malformed(path.path) };
  const record = result.value.json;
  const got =
    typeof record === "object" && record !== null && "key" in record && typeof record.key === "string"
      ? record.key
      : "";
  if (got !== key) return { ok: false, error: malformed(path.path) };
  return { ok: true, value: undefined };
}

/** Reads one object with its bytes; console-api sends the bytes base64-encoded in `body`. */
export async function getObject(bucket: BucketName, key: string): Promise<ApiResult<ObjectContent>> {
  const keyError = invalidKey(key);
  if (keyError) return { ok: false, error: keyError };
  const path = objectPath(bucket, key);
  const result = await request("GET", path);
  if (!result.ok) return { ok: false, error: s3Failure(result, "getObject") };
  if (result.value.status !== 200) return { ok: false, error: malformed(path.path) };
  try {
    return { ok: true, value: toObjectContent(result.value.json, bucket, key) };
  } catch {
    return { ok: false, error: malformed(path.path) };
  }
}

/**
 * One object without its bytes, for a page that needs only metadata. A missing key is null, like getBucket.
 * console-api has no HEAD, so this still costs one GET, but the bytes stop here.
 */
export async function getObjectMeta(bucket: BucketName, key: string): Promise<ApiResult<StoredObject | null>> {
  const result = await getObject(bucket, key);
  if (!result.ok) {
    return result.error.code === "NoSuchKey" ? { ok: true, value: null } : result;
  }
  const { size, contentType, lastModified, etag } = result.value;
  return { ok: true, value: { bucket, key, size, contentType, lastModified, etag } };
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
    return { ok: false, error: s3Failure(result, "deleteObject") };
  }
  if (result.value.status !== 204) return { ok: false, error: malformed(path.path) };
  return { ok: true, value: undefined };
}

export async function deleteBucket(name: BucketName): Promise<ApiResult<void>> {
  const path = route("/buckets/{name}", { name });
  const result = await request("DELETE", path);
  if (!result.ok) {
    if (result.status === 404 && result.error.code === "NotFound") return { ok: true, value: undefined };
    return { ok: false, error: s3Failure(result, "deleteBucket") };
  }
  if (result.value.status !== 204) return { ok: false, error: malformed(path.path) };
  return { ok: true, value: undefined };
}

/** Reads one resource; a 404 is a missing resource, not an error. */
async function getOne<T>(
  path: ApiRoute,
  map: (item: Record<string, unknown>, etag: string) => T,
): Promise<ApiResult<T | null>> {
  const result = await request("GET", path);
  if (!result.ok) {
    return result.error.code === "NotFound" ? { ok: true, value: null } : { ok: false, error: result.error };
  }
  try {
    return { ok: true, value: map(result.value.json as Record<string, unknown>, result.value.etag) };
  } catch {
    return { ok: false, error: malformed(path.path) };
  }
}

export const getInstance = (id: string): Promise<ApiResult<Instance | null>> =>
  getOne(route("/instances/{id}", { id }), toInstance);
export const getVpc = (id: string): Promise<ApiResult<Vpc | null>> => getOne(route("/vpcs/{id}", { id }), toVpc);
export const getVolume = (id: string): Promise<ApiResult<Volume | null>> =>
  getOne(route("/volumes/{id}", { id }), toVolume);

export const launchInstances = ({ tags, keyPair, ...rest }: LaunchRequest) => {
  if (keyPair.kind !== "pair" && keyPair.kind !== "none") {
    return Promise.reject(new Error("Select a key pair or proceed without one."));
  }
  const named = keyPair.kind === "pair" ? { keyName: keyPair.name } : {};
  const body = { ...rest, ...named };
  return mutate(route("/instances"), Object.keys(tags).length > 0 ? { ...body, tags } : body);
};

export const listKeyPairs = (): Promise<ApiResult<StoredKeyPair[]>> => listAll(route("/key-pairs"), parseKeyPairs);

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
  const region = await regionHeader();
  const sent = await request("POST", route("/key-pairs"), undefined, {
    idempotencyKey,
    bodyText: attempt.body,
    region,
  });
  if (!sent.ok) return failedCreate(sent.error, null);
  const read = readCreateItem(sent.value.json);
  if (!read || (draft.mode === "generate" && read.material === "")) return failedCreate(malformed("/key-pairs"), null);
  let issued: IssuedKeyPair = {
    keyPair: read.keyPair,
    privateKey: privateFile(draft, read.keyPair.name, read.material),
    settlement: "succeeded",
  };
  if (sent.value.status !== 202) return { status: "ready", issued };
  let accepted: Operation;
  try {
    accepted = parseOperation((sent.value.json as { operation?: unknown } | null)?.operation);
  } catch {
    return failedCreate(malformed("/key-pairs"), issued);
  }
  const polled = await pollOperation(accepted, region);
  if (!polled.ok) return failedCreate(polled.error, issued);
  const op = polled.value;
  if (op.state === "running") return { status: "ready", issued: { ...issued, settlement: "still-running" } };
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
  return mutate(route("/key-pairs/{id}/delete", { id: parsed }));
}

/** console-api takes at most this many instance IDs in one batch call. */
export const INSTANCE_BATCH_LIMIT = 20;

/** Starts, stops or terminates instances with one operation per batch of up to 20 IDs. */
export async function instanceBatch(action: "start" | "stop" | "terminate", ids: string[]): Promise<ApiResult<void>> {
  for (let index = 0; index < ids.length; index += INSTANCE_BATCH_LIMIT) {
    const result = await mutate(route(`/instances/${action}`), {
      instanceIds: ids.slice(index, index + INSTANCE_BATCH_LIMIT),
    });
    if (!result.ok) return result;
  }
  return { ok: true, value: undefined };
}

/** Adds or overwrites tags on one instance; tags not named stay. */
export const createInstanceTags = (id: string, tags: Record<string, string>) =>
  mutate(route("/instances/{id}/tags", { id }), { tags });
/** The key makes a resent create (double submit, retry) return the first volume instead of making a second. */
export const createVolume = (input: CreateVolumeInput, idempotencyKey: IdempotencyKey) =>
  mutate(
    route("/volumes"),
    {
      volumeType: input.volumeType,
      availabilityZone: input.availabilityZone,
      ...(input.size === null ? {} : { size: input.size }),
      ...(input.iops === null ? {} : { iops: input.iops }),
      ...(input.throughput === null ? {} : { throughput: input.throughput }),
      ...(input.snapshotId === null ? {} : { snapshotId: input.snapshotId }),
    },
    idempotencyKey,
  );
export const deleteVolume = (id: string) => mutate(route("/volumes/{id}/delete", { id }));
export const createSnapshot = ({ volumeId, description }: CreateSnapshotInput, idempotencyKey: IdempotencyKey) =>
  mutate(route("/snapshots"), description ? { volumeId, description } : { volumeId }, idempotencyKey);
const withTags = <T extends object>(body: T, tags: Record<string, string>) =>
  Object.keys(tags).length > 0 ? { ...body, tags } : body;

export const createVpc = (cidrBlock: string, tags: Record<string, string> = {}) =>
  mutate(route("/vpcs"), withTags({ cidrBlock }, tags));
export const deleteVpc = (id: string) => mutate(route("/vpcs/{id}/delete", { id }));
export const createSubnet = (vpcId: string, cidrBlock: string, tags: Record<string, string> = {}) =>
  mutate(route("/subnets"), withTags({ vpcId, cidrBlock }, tags));
/** Adds or overwrites tags on one VPC or subnet; tags not named stay. */
export const createVpcTags = (id: string, tags: Record<string, string>) =>
  mutate(route("/vpcs/{id}/tags", { id }), { tags });
export const createSubnetTags = (id: string, tags: Record<string, string>) =>
  mutate(route("/subnets/{id}/tags", { id }), { tags });
export const deleteSubnet = (id: string) => mutate(route("/subnets/{id}/delete", { id }));

export const listInstanceTypes = (): Promise<ApiResult<InstanceType[]>> =>
  listAll(route("/instance-types"), parseInstanceTypes);
/** console-api only grows a volume; it refuses a smaller size. */
export const modifyVolume = (id: string, size: number) => mutate(route("/volumes/{id}/modify", { id }), { size });

const trimmedText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** `input` comes from a server action, so a caller can send any JSON in its place. */
export async function attachVolume(volumeId: string, input: VolumeAttachment): Promise<ApiResult<void>> {
  const fields: Partial<Record<keyof VolumeAttachment, unknown>> = input ?? {};
  const instanceId = trimmedText(fields.instanceId);
  const device = trimmedText(fields.device);
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
  if (!DEVICE_NAME.test(device)) {
    return {
      ok: false,
      error: {
        code: "InvalidAttachment",
        message: "The device name must be a path like /dev/sdf.",
        requestId: null,
      },
    };
  }
  return mutate(route("/volumes/{id}/attach", { id: volumeId }), { instanceId, device });
}

export function detachVolume(volumeId: string, force = false): Promise<ApiResult<void>> {
  return mutate(route("/volumes/{id}/detach", { id: volumeId }), force ? { force: true } : undefined);
}

export const listSecurityGroups = (): Promise<ApiResult<SecurityGroup[]>> =>
  listAll(route("/security-groups"), parseSecurityGroups);

export async function createSecurityGroup(groupName: string, vpcId: string): Promise<ApiResult<string>> {
  const result = await mutateReturning(route("/security-groups"), { groupName, vpcId });
  if (!result.ok) return result;
  const id = firstItem(result.value, "groupId");
  return id ? { ok: true, value: id } : { ok: false, error: malformed("/security-groups") };
}

/** console-api takes the AWS IpPermissions list and adds all of it or none of it. */
export const authorizeIngress = (groupId: string, permissions: IngressPermission[]) =>
  mutate(route("/security-groups/{id}/authorize-ingress", { id: groupId }), {
    ipPermissions: permissions.map(({ ipProtocol, fromPort, toPort, cidrIp }) => ({
      ipProtocol,
      fromPort,
      toPort,
      ipRanges: [{ cidrIp }],
    })),
  });
export const revokeIngress = (groupId: string, ipPermissions: IngressPermission) =>
  mutate(route("/security-groups/{id}/revoke-ingress", { id: groupId }), { ipPermissions });
export const deleteSecurityGroup = (id: string) => mutate(route("/security-groups/{id}/delete", { id }));

export const listAddresses = (): Promise<ApiResult<ElasticIp[]>> => listAll(route("/addresses"), parseAddresses);
export const allocateAddress = () => mutate(route("/addresses"), {});
export const associateAddress = (allocationId: string, instanceId: string) =>
  mutate(route("/addresses/{id}/associate", { id: allocationId }), { instanceId });
export const disassociateAddress = (allocationId: string) =>
  mutate(route("/addresses/{id}/disassociate", { id: allocationId }));
export const releaseAddress = (allocationId: string) => mutate(route("/addresses/{id}/release", { id: allocationId }));

export const listSnapshots = (): Promise<ApiResult<Snapshot[]>> => listAll(route("/snapshots"), parseSnapshots);
export const deleteSnapshot = (id: string) => mutate(route("/snapshots/{id}/delete", { id }));

/**
 * The vws:Admin* actions the operator menu may show. Empty when console-api grants none (its 403 for a caller who
 * is not an administrator) or the read failed: the menu stays hidden, and each admin page reports its own error.
 */
export async function getAdminPermissions(): Promise<string[]> {
  const result = await getOne(route("/admin/permissions"), parseAdminPermissions);
  return result.ok && result.value ? result.value : [];
}

export const listAdminRegions = (): Promise<ApiResult<AdminRegion[]>> =>
  listAll(route("/admin/regions"), parseAdminRegions);
export const listAdminAwsAccounts = (): Promise<ApiResult<AdminAwsAccount[]>> =>
  listAll(route("/admin/aws-accounts"), parseAdminAwsAccounts);
export const getAdminRegion = (name: string): Promise<ApiResult<Versioned<AdminRegion> | null>> =>
  getOne(route("/admin/regions/{name}", { name }), (item, etag) => ({ ...toAdminRegion(item), etag }));

/** console-api gives a region push and a connection test 15 s each, so these calls wait at least 20 s. */
const adminWait = () => ({ timeoutMs: Math.max(timeoutMs(), 20_000) });

export async function saveAdminRegion(input: AdminRegionInput, etag: string | null): Promise<ApiResult<void>> {
  const item = route("/admin/regions/{name}", { name: input.name });
  const result =
    etag === null
      ? await request("POST", route("/admin/regions"), input, adminWait())
      : await request("PATCH", item, input, { ...adminWait(), ifMatch: etag });
  return result.ok ? { ok: true, value: undefined } : { ok: false, error: result.error };
}

export async function deleteAdminRegion(name: string): Promise<ApiResult<void>> {
  const result = await request("DELETE", route("/admin/regions/{name}", { name }));
  if (result.ok || result.error.code === "NotFound") return { ok: true, value: undefined };
  return { ok: false, error: result.error };
}

/** console-api's saved test takes tokenSecret alone and answers 400 to any other field. */
export async function testAdminRegion(input: AdminRegionInput, saved: boolean): Promise<ApiResult<ConnectionStep[]>> {
  const path = saved ? route("/admin/regions/{name}/test", { name: input.name }) : route("/admin/regions/test");
  const body = saved ? { tokenSecret: input.tokenSecret } : input;
  const result = await request("POST", path, body, adminWait());
  if (!result.ok) return { ok: false, error: result.error };
  try {
    return { ok: true, value: parseConnectionSteps(result.value.json) };
  } catch {
    return { ok: false, error: malformed(path.path) };
  }
}

/** Never fails: a reading console-api did not return has status "unknown" and the reason as its last error. */
export async function getAdminRegionHealth(name: string): Promise<AdminRegionHealth> {
  const result = await getOne(route("/admin/regions/{name}/health", { name }), toAdminRegionHealth);
  if (!result.ok) return unknownHealth(result.error);
  return result.value ?? unknownHealth({ code: "NotFound", message: "registration not found", requestId: null });
}

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
    reply = await apiFetch(
      base,
      route("/auth/login"),
      {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json", ...(await browserOrigin()) },
        body: JSON.stringify(
          input.mfaCode ? input : { account: input.account, userName: input.userName, password: input.password },
        ),
      },
      { iamMode: "on" },
    );
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
    const reply = await apiFetch(
      base,
      route("/auth/logout"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${API_SESSION_COOKIE}=${session.session}; ${CSRF_COOKIE}=${session.csrf}`,
          "x-csrf-token": session.csrf,
          ...(await browserOrigin()),
        },
        body: "{}",
      },
      { iamMode: "on" },
    );
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
  const result = await request("GET", route("/auth/session"));
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
  return withSpan("vws.session", "internal", {}, readSignedInSession);
}

async function readSignedInSession(): Promise<SessionInfo | null> {
  const state = await iamState();
  if (state !== "on" && state !== "off") return null;
  const iam = state === "on";
  const base = apiBase();
  if (typeof base !== "string") return null;
  let credentials: Record<string, string>;
  if (iam) {
    const session = await currentSession();
    if (!session) return null;
    credentials = { cookie: `${API_SESSION_COOKIE}=${session.session}; ${CSRF_COOKIE}=${session.csrf}` };
  } else {
    // IAM off: the bearer is the account root; console-api reports its account the same way.
    const token = bearer();
    if (typeof token !== "string") return null;
    credentials = { authorization: `Bearer ${token}` };
  }
  const started = performance.now();
  try {
    const reply = await apiFetch(
      base,
      route("/auth/session"),
      { headers: { accept: "application/json", ...credentials } },
      { iamMode: state },
    );
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
