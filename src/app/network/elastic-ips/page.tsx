import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { ElasticIpsView } from "@/components/sites/console/elastic-ips-view";
import { listAddresses, listInstances } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Elastic IPs · VWS" };

export default async function Page() {
  await connection();
  const [addresses, instances] = await Promise.all([listAddresses(), listInstances()]);
  return (
    <Suspense>
      <ElasticIpsView
        addresses={addresses.ok ? addresses.value : []}
        instances={instances.ok ? instances.value : []}
        loadError={addresses.ok ? (instances.ok ? null : instances.error) : addresses.error}
      />
    </Suspense>
  );
}
