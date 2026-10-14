import type { Metadata } from "next";
import { connection } from "next/server";
import { InstanceDetailView } from "@/components/sites/console/instance-detail-view";
import { describeInstances, describeSubnets } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Instance details · VWS" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const result = await describeInstances([id]);
  if (!result.ok) {
    const notFound = result.error.code.endsWith(".NotFound") || result.error.code.endsWith(".Malformed");
    return <InstanceDetailView id={id} instance={null} loadError={notFound ? null : result.error} />;
  }
  const found = result.value.find((item) => item.id === id) ?? null;
  const subnets = found?.subnetId ? await describeSubnets() : null;
  const vpcId = subnets?.ok ? (subnets.value.find((item) => item.id === found?.subnetId)?.vpcId ?? "") : "";
  return <InstanceDetailView id={id} instance={found ? { ...found, vpcId } : null} loadError={null} />;
}
