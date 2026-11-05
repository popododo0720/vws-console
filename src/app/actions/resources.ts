"use server";

import { revalidatePath } from "next/cache";
import * as vws from "@/lib/vws-api/client";
import { fileProblem, objectKeyProblem } from "@/lib/object-upload";
import {
  parseBucketName,
  parseStoredBucketName,
  reservedBucketName,
  type ApiError,
  type ApiResult,
  type LaunchRequest,
  type StoredObject,
} from "@/lib/vws-api/adapter";
import type { IngressPermission, VolumeAttachment } from "@/types/console";
import {
  MAX_RULE_CHANGES,
  opApplied,
  parseIngressPermission,
  permissionLabel,
  planRuleOps,
  type RuleChanges,
  type RuleOp,
} from "@/lib/security-group-rules";
import {
  deleteBatchError,
  parseIdempotencyKey,
  parseKeyPairId,
  type CreateAttempt,
  type KeyPairCreateResult,
} from "@/lib/key-pair";
import { isSnapshotId, isVolumeId, parseCreateSnapshot, parseCreateVolume } from "@/lib/ebs";

async function each(ids: string[], run: (id: string) => Promise<ApiResult<void>>): Promise<ApiError | null> {
  for (const id of ids) {
    const result = await run(id);
    if (!result.ok) return result.error;
  }
  return null;
}

/** The object page, so Back after a delete or an overwrite does not show the old object from the client cache. */
const OBJECT_PAGE = "/storage/buckets/[name]/object";

const errorOf = async (pending: Promise<ApiResult<void>>) => {
  const result = await pending;
  return result.ok ? null : result.error;
};

export async function launchInstancesAction(req: LaunchRequest) {
  return errorOf(vws.launchInstances(req));
}

export async function startInstancesAction(ids: string[]) {
  return errorOf(vws.instanceBatch("start", ids));
}

export async function stopInstancesAction(ids: string[]) {
  return errorOf(vws.instanceBatch("stop", ids));
}

export async function terminateInstancesAction(ids: string[]) {
  return errorOf(vws.instanceBatch("terminate", ids));
}

/** Renames an instance through its Name tag. console-api has no DeleteTags, so a name cannot be cleared. */
const NAME_REQUIRED: ApiError = {
  code: "NameRequired",
  message: "The VWS API cannot remove a Name tag yet, so enter a name.",
  requestId: null,
};

/** Writes the Name tag through one of the tags endpoints. console-api has no DeleteTags, so a name cannot be cleared. */
async function rename(
  write: (id: string, tags: Record<string, string>) => Promise<ApiResult<void>>,
  id: string,
  name: string,
) {
  const trimmed = name.trim();
  return trimmed ? errorOf(write(id, { Name: trimmed })) : NAME_REQUIRED;
}

const nameTag = (name: string): Record<string, string> => (name.trim() ? { Name: name.trim() } : {});

export async function renameInstanceAction(id: string, name: string): Promise<ApiError | null> {
  return rename(vws.createInstanceTags, id, name);
}

export async function renameVpcAction(id: string, name: string): Promise<ApiError | null> {
  return rename(vws.createVpcTags, id, name);
}

export async function renameSubnetAction(id: string, name: string): Promise<ApiError | null> {
  return rename(vws.createSubnetTags, id, name);
}

const INVALID_IDEMPOTENCY_KEY: ApiError = {
  code: "InvalidArgument",
  message: "The idempotency key is not valid.",
  requestId: null,
};

/** Retrying with the same key returns the first volume; console-api refuses the key with a different body. */
export async function createVolumeAction(raw: unknown, rawKey: unknown): Promise<ApiError | null> {
  const input = parseCreateVolume(raw);
  if ("code" in input) return input;
  const key = typeof rawKey === "string" ? parseIdempotencyKey(rawKey) : null;
  if (!key) return INVALID_IDEMPOTENCY_KEY;
  return errorOf(vws.createVolume(input, key));
}

/** A resource that is already gone counts as deleted, so Delete after a partial failure finishes the rest. */
const deleteOrGone =
  (remove: (id: string) => Promise<ApiResult<void>>) =>
  async (id: string): Promise<ApiResult<void>> => {
    const result = await remove(id);
    return !result.ok && result.error.code === "NotFound" ? { ok: true, value: undefined } : result;
  };

export async function deleteVolumesAction(ids: unknown): Promise<ApiError | null> {
  if (!Array.isArray(ids) || !ids.every(isVolumeId)) return invalid("A volume ID is not valid.");
  return each(ids, deleteOrGone(vws.deleteVolume));
}

const INVALID_BUCKET_NAME: ApiError = {
  code: "InvalidArgument",
  message: "Use 3\u201363 characters: lowercase letters, numbers, and hyphens.",
  requestId: null,
};

const RESERVED_BUCKET_NAME: ApiError = {
  code: "InvalidArgument",
  message:
    "Bucket names cannot start with xn--, sthree-, or amzn-s3-demo-, or end with -s3alias, --ol-s3, --x-s3, or --table-s3.",
  requestId: null,
};

export async function createBucketAction(rawName: string): Promise<ApiError | null> {
  const name = parseBucketName(rawName);
  if (name) {
    const result = await vws.putBucket(name);
    return result.ok ? null : result.error;
  }
  const stored = parseStoredBucketName(rawName);
  return stored && reservedBucketName(stored) ? RESERVED_BUCKET_NAME : INVALID_BUCKET_NAME;
}

export type BucketDeletion = { deleted: string[]; error: ApiError | null; failedName: string | null };

export async function deleteBucketsAction(names: string[]): Promise<BucketDeletion> {
  const deleted: string[] = [];
  for (const rawName of names) {
    const name = parseStoredBucketName(rawName);
    if (!name) return { deleted, error: INVALID_BUCKET_NAME, failedName: rawName };
    const result = await vws.deleteBucket(name);
    if (!result.ok) return { deleted, error: result.error, failedName: name };
    deleted.push(name);
  }
  return { deleted, error: null, failedName: null };
}

export async function uploadObjectAction(rawBucket: string, formData: FormData): Promise<ApiError | null> {
  const bucket = parseStoredBucketName(rawBucket);
  if (!bucket) return INVALID_BUCKET_NAME;
  const key = String(formData.get("key") ?? "");
  const keyProblem = objectKeyProblem(key);
  if (keyProblem) return { code: "InvalidArgument", message: keyProblem, requestId: null };
  const file = formData.get("file");
  if (!(file instanceof File)) return { code: "InvalidArgument", message: "Choose a file to upload.", requestId: null };
  const tooLarge = fileProblem(file);
  if (tooLarge) return tooLarge;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await vws.putObject(bucket, key, bytes, file.type || "application/octet-stream");
  if (!result.ok) return result.error;
  revalidatePath(OBJECT_PAGE, "page");
  return null;
}

/** Looks up one object for the Objects tab. A missing key is null, and the bytes never leave the server. */
export async function getObjectAction(rawBucket: string, key: string): Promise<ApiResult<StoredObject | null>> {
  const bucket = parseStoredBucketName(rawBucket);
  if (!bucket) return { ok: false, error: INVALID_BUCKET_NAME };
  return vws.getObjectMeta(bucket, key);
}

export async function deleteObjectAction(rawBucket: string, key: string): Promise<ApiError | null> {
  const bucket = parseStoredBucketName(rawBucket);
  if (!bucket) return INVALID_BUCKET_NAME;
  const error = await errorOf(vws.deleteObject(bucket, key));
  if (!error) revalidatePath(OBJECT_PAGE, "page");
  return error;
}

export async function createSnapshotAction(raw: unknown, rawKey: unknown): Promise<ApiError | null> {
  const input = parseCreateSnapshot(raw);
  if ("code" in input) return input;
  const key = typeof rawKey === "string" ? parseIdempotencyKey(rawKey) : null;
  if (!key) return INVALID_IDEMPOTENCY_KEY;
  return errorOf(vws.createSnapshot(input, key));
}

export async function createVpcAction(cidr: string, name = "") {
  return errorOf(vws.createVpc(cidr, nameTag(name)));
}

export async function deleteVpcsAction(ids: string[]) {
  return each(ids, vws.deleteVpc);
}

export async function createSubnetAction(vpcId: string, cidr: string, name = "") {
  return errorOf(vws.createSubnet(vpcId, cidr, nameTag(name)));
}

export async function deleteSubnetsAction(ids: string[]) {
  return each(ids, vws.deleteSubnet);
}

export async function modifyVolumeAction(id: string, sizeGiB: number) {
  return errorOf(vws.modifyVolume(id, sizeGiB));
}

export async function attachVolumeAction(volumeId: string, input: VolumeAttachment) {
  return errorOf(vws.attachVolume(volumeId, input));
}

export async function detachVolumeAction(volumeId: string) {
  return errorOf(vws.detachVolume(volumeId));
}

const invalid = (message: string): ApiError => ({ code: "InvalidParameterValue", message, requestId: null });

const SECURITY_GROUP_ID = /^sg-[0-9a-f]{8,17}$/;

const parseGroupId = (raw: unknown): string | null =>
  typeof raw === "string" && SECURITY_GROUP_ID.test(raw) ? raw : null;

function parseRules(raw: unknown, what: string): IngressPermission[] | ApiError {
  if (!Array.isArray(raw)) return invalid(`The ${what} must be a list.`);
  if (raw.length > MAX_RULE_CHANGES) return invalid(`Send at most ${MAX_RULE_CHANGES} ${what} at a time.`);
  const rules: IngressPermission[] = [];
  for (const [index, item] of raw.entries()) {
    const rule = parseIngressPermission(item);
    if (!rule) return invalid(`Rule ${index + 1} of the ${what} is not a rule the VWS API takes.`);
    rules.push(rule);
  }
  return rules;
}

async function currentRules(groupId: string): Promise<ApiResult<IngressPermission[]>> {
  const listed = await vws.listSecurityGroups();
  if (!listed.ok) return listed;
  const group = listed.value.find((item) => item.id === groupId);
  if (!group) {
    return {
      ok: false,
      error: {
        code: "InvalidGroup.NotFound",
        message: `The security group '${groupId}' does not exist`,
        requestId: null,
      },
    };
  }
  return { ok: true, value: group.rules.flatMap((rule) => (rule.permission ? [rule.permission] : [])) };
}

const send = (groupId: string, op: RuleOp) =>
  op.kind === "revoke" ? vws.revokeIngress(groupId, op.permission) : vws.authorizeIngress(groupId, op.permission);

/**
 * Applies rule changes against the rules the group holds now, so a double submit, a retry after a partial failure
 * or a save from a stale page sends only what is still missing. A failed call counts as done when a fresh read
 * shows its result, as when a parallel save made it first.
 */
async function applyRuleChanges(groupId: string, changes: RuleChanges): Promise<ApiError | null> {
  const current = await currentRules(groupId);
  if (!current.ok) return current.error;
  const done: string[] = [];
  const verb = (op: RuleOp) => (op.kind === "revoke" ? "deleted" : "added");
  for (const op of planRuleOps(current.value, changes)) {
    const result = await send(groupId, op);
    const reread = result.ok ? null : await currentRules(groupId);
    if (result.ok || (reread?.ok && opApplied(reread.value, op))) {
      done.push(`${verb(op)} ${permissionLabel(op.permission)}`);
      continue;
    }
    const saved = done.length > 0 ? ` Already saved: ${done.join("; ")}.` : "";
    return {
      ...result.error,
      message: `Rule ${permissionLabel(op.permission)} was not ${verb(op)}: ${result.error.message}${saved}`,
    };
  }
  return null;
}

/** Saves the inbound rules page. Every field is checked here, since a server action is a public endpoint. */
export async function saveInboundRulesAction(rawGroupId: unknown, rawChanges: unknown): Promise<ApiError | null> {
  const groupId = parseGroupId(rawGroupId);
  if (!groupId) return invalid("The security group ID is not valid.");
  const { remove, add } = (typeof rawChanges === "object" && rawChanges !== null ? rawChanges : {}) as Record<
    string,
    unknown
  >;
  const removed = parseRules(remove, "rules to delete");
  if (!Array.isArray(removed)) return removed;
  const added = parseRules(add, "rules to add");
  if (!Array.isArray(added)) return added;
  return applyRuleChanges(groupId, { remove: removed, add: added });
}

export async function createSecurityGroupAction(
  rawName: unknown,
  rawVpcId: unknown,
  rawInbound: unknown,
): Promise<ApiError | null> {
  const groupName = typeof rawName === "string" ? rawName.trim() : "";
  if (!groupName || new TextEncoder().encode(groupName).length > 255)
    return invalid("Enter a security group name of 1 to 255 characters.");
  if (typeof rawVpcId !== "string" || !/^vpc-[0-9a-f]{8,17}$/.test(rawVpcId)) return invalid("Choose a VPC.");
  const inbound = parseRules(rawInbound, "inbound rules");
  if (!Array.isArray(inbound)) return inbound;
  const created = await vws.createSecurityGroup(groupName, rawVpcId);
  if (!created.ok) return created.error;
  const failed = await applyRuleChanges(created.value, { remove: [], add: inbound });
  return failed && { ...failed, message: `Security group ${created.value} was created. ${failed.message}` };
}

/** Deletes groups in order. A group a fresh read no longer lists counts as deleted, so a retry finishes the rest. */
export async function deleteSecurityGroupsAction(rawIds: unknown): Promise<ApiError | null> {
  if (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.length > MAX_RULE_CHANGES)
    return invalid("Choose security groups to delete.");
  const ids = rawIds.map(parseGroupId).filter((id): id is string => id !== null);
  if (ids.length !== rawIds.length) return invalid("A security group ID is not valid.");
  return each(ids, async (id) => {
    const result = await vws.deleteSecurityGroup(id);
    if (result.ok) return result;
    const listed = await vws.listSecurityGroups();
    return listed.ok && !listed.value.some((group) => group.id === id) ? { ok: true, value: undefined } : result;
  });
}

export async function allocateAddressAction() {
  return errorOf(vws.allocateAddress());
}

export async function associateAddressAction(allocationId: string, instanceId: string) {
  return errorOf(vws.associateAddress(allocationId, instanceId));
}

export async function disassociateAddressesAction(ids: string[]) {
  return each(ids, vws.disassociateAddress);
}

export async function releaseAddressesAction(ids: string[]) {
  return each(ids, vws.releaseAddress);
}

export async function deleteSnapshotsAction(ids: unknown): Promise<ApiError | null> {
  if (!Array.isArray(ids) || !ids.every(isSnapshotId)) return invalid("A snapshot ID is not valid.");
  return each(ids, deleteOrGone(vws.deleteSnapshot));
}

export async function createKeyPairAction(attempt: CreateAttempt): Promise<KeyPairCreateResult> {
  return vws.createKeyPair(attempt);
}

const invalidKeyPairId: ApiError = {
  code: "InvalidArgument",
  message: "Key pair id must be key- followed by 8 to 17 hex digits.",
  requestId: null,
};

export async function deleteKeyPairsAction(ids: string[]): Promise<ApiError | null> {
  for (const raw of ids) {
    const id = parseKeyPairId(raw);
    if (!id) return invalidKeyPairId;
    const result = await vws.deleteKeyPair(id);
    if (!result.ok) {
      const stopping = deleteBatchError(result.error);
      if (stopping) return stopping;
    }
  }
  return null;
}
