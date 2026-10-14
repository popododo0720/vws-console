import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { VpcsView } from "@/components/sites/console/vpcs-view";
import { describeSubnets, describeVpcs } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Your VPCs · VWS" };

export default async function Page() {
  await connection();
  const [vpcs, subnets] = await Promise.all([describeVpcs(), describeSubnets()]);
  const loadError = !vpcs.ok ? vpcs.error : !subnets.ok ? subnets.error : null;
  return (
    <Suspense>
      <VpcsView vpcs={vpcs.ok ? vpcs.value : []} subnets={subnets.ok ? subnets.value : []} loadError={loadError} />
    </Suspense>
  );
}
