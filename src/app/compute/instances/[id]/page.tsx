import type { Metadata } from "next";
import { connection } from "next/server";
import { InstanceDetailView } from "@/components/sites/console/instance-detail-view";
import { withVpcIds } from "@/lib/vws-api/adapter";
import { getInstance, listSubnets } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Instance details · VWS" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const result = await getInstance(id);
  if (!result.ok) return <InstanceDetailView id={id} instance={null} loadError={result.error} />;
  if (!result.value) return <InstanceDetailView id={id} instance={null} loadError={null} />;
  const subnets = await listSubnets();
  const [instance] = withVpcIds([result.value], subnets.ok ? subnets.value : []);
  return <InstanceDetailView id={id} instance={instance} loadError={null} />;
}
