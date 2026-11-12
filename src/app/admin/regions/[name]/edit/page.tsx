import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminRegionFormView } from "@/components/sites/console/admin-region-form-view";
import { AdminAccessDenied } from "@/components/sites/console/admin-regions-view";
import { getAdminRegion } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Edit region · VWS" };

export default async function Page({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  await connection();
  const region = await getAdminRegion(name);
  if (!region.ok && region.error.code === "PermissionDenied") return <AdminAccessDenied error={region.error} />;
  const missing = { code: "NotFound", message: `${name} is not a registered region.`, requestId: null };
  return (
    <AdminRegionFormView
      name={name}
      region={region.ok ? region.value : null}
      loadError={region.ok ? (region.value ? null : missing) : region.error}
    />
  );
}
