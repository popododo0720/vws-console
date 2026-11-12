"use server";

import { withActionSpan } from "@/lib/ops/span";
import { toAdminRegionInput, type ApiError, type ApiResult, type ConnectionStep } from "@/lib/vws-api/adapter";
import { deleteAdminRegion, saveAdminRegion, testAdminRegion } from "@/lib/vws-api/client";

const invalid = (message: string): ApiError => ({ code: "InvalidArgument", message, requestId: null });

/** console-api's ETag for a registration: its version in quotes. */
const ETAG = /^"[0-9]+"$/;

/**
 * Registers a region (etag null) or saves an edit of the one the form names. The secret is its own argument, sent
 * on only when one was typed, and nothing returned here repeats it.
 */
export async function saveRegionAction(form: unknown, secret: unknown, etag: unknown): Promise<ApiError | null> {
  return withActionSpan("saveRegionAction", async () => {
    if (etag !== null && (typeof etag !== "string" || !ETAG.test(etag))) {
      return invalid("The region version is not valid. Reload the page and try again.");
    }
    const result = await saveAdminRegion(toAdminRegionInput(form, secret), etag);
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

/** Tests the saved region the form names, or with saved false the form's own values without saving them. */
export async function testRegionAction(
  form: unknown,
  secret: unknown,
  saved: unknown,
): Promise<ApiResult<ConnectionStep[]>> {
  return withActionSpan("testRegionAction", async () => {
    return testAdminRegion(toAdminRegionInput(form, secret), saved === true);
  });
}
