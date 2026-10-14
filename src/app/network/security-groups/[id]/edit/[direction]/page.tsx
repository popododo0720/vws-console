import type { Metadata } from "next";
import { connection } from "next/server";
import { SecurityGroupRulesEditView } from "@/components/sites/console/security-group-rules-edit-view";
import { listSecurityGroups } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Edit rules · VWS" };

export default async function Page({ params }: { params: Promise<{ id: string; direction: string }> }) {
  await connection();
  const { id, direction } = await params;
  const result = await listSecurityGroups();
  const group = result.ok ? (result.value.find((item) => item.id === id) ?? null) : null;
  return (
    <SecurityGroupRulesEditView
      id={id}
      direction={direction === "outbound" ? "out" : "in"}
      group={group}
      loadError={result.ok ? null : result.error}
    />
  );
}
