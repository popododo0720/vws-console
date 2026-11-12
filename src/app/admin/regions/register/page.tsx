import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminRegionFormView } from "@/components/sites/console/admin-region-form-view";
import { AdminAccessDenied } from "@/components/sites/console/admin-regions-view";
import { listAdminRegions } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Register region · VWS" };

export default async function Page() {
  await connection();
  const regions = await listAdminRegions();
  if (!regions.ok && regions.error.code === "PermissionDenied") return <AdminAccessDenied error={regions.error} />;
  return <AdminRegionFormView region={null} loadError={null} />;
}
