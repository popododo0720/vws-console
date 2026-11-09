import type { Metadata } from "next";
import { connection } from "next/server";
import { SecurityGroupDetailView } from "@/components/sites/console/security-group-detail-view";
import { SAVED_INBOUND } from "@/lib/security-group-rules";
import { listSecurityGroups } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Security group details · VWS" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string | string[] }>;
}) {
  await connection();
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  // console-api has no per-group GET, so the group is found in the list.
  const result = await listSecurityGroups();
  const group = result.ok ? (result.value.find((item) => item.id === id) ?? null) : null;
  return (
    <SecurityGroupDetailView
      id={id}
      group={group}
      loadError={result.ok ? null : result.error}
      savedInbound={saved === SAVED_INBOUND}
    />
  );
}
