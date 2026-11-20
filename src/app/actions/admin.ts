"use server";

import { withActionSpan } from "@/lib/ops/span";
import { ACCOUNT_ID, ETAG, checkPveApiUrls, toAdminProjectInput, toAdminRegionInput } from "@/lib/vws-api/adapter";
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
    const input = toAdminRegionInput(form, secret);
    const urls = checkPveApiUrls(input.pveApiUrls);
    if (urls) return { ...invalid(urls), field: "pveApiUrls" };
    const result = await saveAdminRegion(input, etag);
    if (!result.ok) return result.error;
    // console-api answers 2xx when it saved the region but could not apply it to the region daemon.
    const failed = result.value.lastError;
    return failed
      ? {
          code: "ApplyFailed",
          message: `The region was saved, but applying it to the region daemon failed: ${failed.message}`,
          requestId: null,
        }
      : null;
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
    const input = toAdminRegionInput(form, secret);
    const urls = saved === true ? null : checkPveApiUrls(input.pveApiUrls);
    if (urls) return { ok: false, error: { ...invalid(urls), field: "pveApiUrls" } };
    return testAdminRegion(input, saved === true);
  });
}
