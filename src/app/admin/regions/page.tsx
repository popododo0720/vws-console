import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminAccessDenied, AdminRegionsView, type RegionRow } from "@/components/sites/console/admin-regions-view";
import { getAdminRegionHealth, listAdminAwsAccounts, listAdminRegions } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Regions · VWS" };

export default async function Page() {
  await connection();
  const [regions, accounts] = await Promise.all([listAdminRegions(), listAdminAwsAccounts()]);
  if (!regions.ok && regions.error.code === "PermissionDenied") return <AdminAccessDenied error={regions.error} />;
  const clusters = regions.ok ? regions.value : [];
  const health = await Promise.all(clusters.map((region) => getAdminRegionHealth(region.name)));
  const rows: RegionRow[] = [
    ...clusters.map((region, index) => ({
      id: region.name,
      name: region.name,
      type: "Proxmox" as const,
      clusterName: region.clusterName,
      accountId: "",
      health: health[index],
    })),
    ...(accounts.ok ? accounts.value : []).flatMap((account) =>
      account.allowedRegions.map((name) => ({
        id: `${account.id}/${name}`,
        name,
        type: "AWS" as const,
        clusterName: "",
        accountId: account.id,
        health: null,
      })),
    ),
  ];
  return (
    <AdminRegionsView
      rows={rows}
      regionsError={regions.ok ? null : regions.error}
      accountsError={accounts.ok ? null : accounts.error}
    />
  );
}
