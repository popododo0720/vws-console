"use server";

import { withActionSpan } from "@/lib/ops/span";
import { toAdminRegionInput, type ApiError, type ApiResult, type ConnectionStep } from "@/lib/vws-api/adapter";
import { deleteAdminRegion, saveAdminRegion, testAdminRegion } from "@/lib/vws-api/client";

const invalid = (message: string): ApiError => ({ code: "InvalidArgument", message, requestId: null });

/** Checked because a server action is a public endpoint and this value becomes the If-Match header. */
const ETAG = /^"[0-9]+"$/;

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

export async function testRegionAction(
  form: unknown,
  secret: unknown,
  saved: unknown,
): Promise<ApiResult<ConnectionStep[]>> {
  return withActionSpan("testRegionAction", async () => {
    return testAdminRegion(toAdminRegionInput(form, secret), saved === true);
  });
}
