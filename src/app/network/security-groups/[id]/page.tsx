import type { Metadata } from "next";
import { SecurityGroupDetailView } from "@/components/sites/console/security-group-detail-view";

export const metadata: Metadata = { title: "Security group details · VWS" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SecurityGroupDetailView id={id} />;
}
