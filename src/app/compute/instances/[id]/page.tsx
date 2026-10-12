import type { Metadata } from "next";
import { InstanceDetailView } from "@/components/sites/console/instance-detail-view";

export const metadata: Metadata = { title: "Instance details · VWS" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InstanceDetailView id={id} />;
}
