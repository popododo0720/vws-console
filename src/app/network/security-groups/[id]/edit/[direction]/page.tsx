import type { Metadata } from "next";
import { SecurityGroupRulesEditView } from "@/components/sites/console/security-group-rules-edit-view";

export const metadata: Metadata = { title: "Edit rules · VWS" };

export default async function Page({ params }: { params: Promise<{ id: string; direction: string }> }) {
  const { id, direction } = await params;
  return <SecurityGroupRulesEditView id={id} direction={direction === "outbound" ? "out" : "in"} />;
}
