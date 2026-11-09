import type { Metadata } from "next";
import { connection } from "next/server";
import { SecurityGroupDetailView } from "@/components/sites/console/security-group-detail-view";
import { listSecurityGroups } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Security group details · VWS" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  // console-api has no per-group GET, so the group is found in the list.
  const result = await listSecurityGroups();
  const group = result.ok ? (result.value.find((item) => item.id === id) ?? null) : null;
  return <SecurityGroupDetailView id={id} group={group} loadError={result.ok ? null : result.error} />;
}
