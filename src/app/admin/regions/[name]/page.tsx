import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminRegionDetailView } from "@/components/sites/console/admin-region-detail-view";
import { AdminAccessDenied } from "@/components/sites/console/admin-regions-view";
import { getAdminRegion, getAdminRegionHealth } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Region details · VWS" };

export default async function Page({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  await connection();
  const [region, health] = await Promise.all([getAdminRegion(name), getAdminRegionHealth(name)]);
  if (!region.ok && region.error.code === "PermissionDenied") return <AdminAccessDenied error={region.error} />;
  return (
    <AdminRegionDetailView
      name={name}
      region={region.ok ? region.value : null}
      health={health}
      loadError={region.ok ? null : region.error}
    />
  );
}
