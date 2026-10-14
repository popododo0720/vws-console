import type { Metadata } from "next";
import { connection } from "next/server";
import { SecurityGroupsView } from "@/components/sites/console/security-groups-view";
import { listSecurityGroups } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Security groups · VWS" };

export default async function Page() {
  await connection();
  const result = await listSecurityGroups();
  return <SecurityGroupsView securityGroups={result.ok ? result.value : []} loadError={result.ok ? null : result.error} />;
}
