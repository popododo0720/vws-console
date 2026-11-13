"use server";

import { withActionSpan } from "@/lib/ops/span";
import { ACCOUNT_ID, ETAG, toAdminProjectInput, toAdminRegionInput } from "@/lib/vws-api/adapter";
import type { ApiError, ApiResult, ConnectionStep } from "@/lib/vws-api/adapter";
import { deleteAdminRegion, saveAdminProject, saveAdminRegion, testAdminRegion } from "@/lib/vws-api/client";

const invalid = (message: string): ApiError => ({ code: "InvalidArgument", message, requestId: null });

/** A server action is a public endpoint and this value becomes the If-Match header, so its shape is checked. */
const isEtag = (etag: unknown): etag is string => typeof etag === "string" && ETAG.test(etag);

export async function saveRegionAction(form: unknown, secret: unknown, etag: unknown): Promise<ApiError | null> {
  return withActionSpan("saveRegionAction", async () => {
    if (etag !== null && !isEtag(etag)) {
      return invalid("The region version is not valid. Reload the page and try again.");
    }
    const result = await saveAdminRegion(toAdminRegionInput(form, secret), etag);
    return result.ok ? null : result.error;
  });
}

export async function saveProjectAction(project: unknown, mapping: unknown, etag: unknown): Promise<ApiError | null> {
  return withActionSpan("saveProjectAction", async () => {
    if (typeof project !== "string" || !ACCOUNT_ID.test(project)) return invalid("A project ID is 12 digits.");
    if (!isEtag(etag)) return invalid("The project version is not valid. Reload the page and try again.");
    const input = toAdminProjectInput(mapping);
    if (!input.ok) return input.error;
    const result = await saveAdminProject(project, input.value, etag);
    return result.ok ? null : result.error;
  });
}

export async function deleteRegionAction(name: unknown): Promise<ApiError | null> {
  return withActionSpan("deleteRegionAction", async () => {
    if (typeof name !== "string" || !name) return invalid("Choose a region to delete.");
    const result = await deleteAdminRegion(name);
    return result.ok ? null : result.error;
  });
}

export async function testRegionAction(
  form: unknown,
  secret: unknown,
  saved: unknown,
): Promise<ApiResult<ConnectionStep[]>> {
  return withActionSpan("testRegionAction", async () => {
    return testAdminRegion(toAdminRegionInput(form, secret), saved === true);
  });
}
