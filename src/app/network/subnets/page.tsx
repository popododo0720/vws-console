import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { SubnetsView } from "@/components/sites/console/subnets-view";
import { listSubnets, listVpcs } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Subnets · VWS" };

export default async function Page() {
  await connection();
  const [subnets, vpcs] = await Promise.all([listSubnets(), listVpcs()]);
  const loadError = !subnets.ok ? subnets.error : !vpcs.ok ? vpcs.error : null;
  return (
    <Suspense>
      <SubnetsView subnets={subnets.ok ? subnets.value : []} vpcs={vpcs.ok ? vpcs.value : []} loadError={loadError} />
    </Suspense>
  );
}
