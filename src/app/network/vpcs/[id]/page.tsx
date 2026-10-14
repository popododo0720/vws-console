import type { Metadata } from "next";
import { connection } from "next/server";
import { VpcDetailView } from "@/components/sites/console/vpc-detail-view";
import { getVpc, listSubnets } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "VPC details · VWS" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const [vpc, subnets] = await Promise.all([getVpc(id), listSubnets()]);
  return (
    <VpcDetailView
      id={id}
      vpc={vpc.ok ? vpc.value : null}
      subnets={subnets.ok ? subnets.value : []}
      loadError={vpc.ok ? (subnets.ok ? null : subnets.error) : vpc.error}
    />
  );
}
