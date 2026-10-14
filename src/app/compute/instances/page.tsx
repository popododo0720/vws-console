import type { Metadata } from "next";
import { connection } from "next/server";
import { InstancesView } from "@/components/sites/console/instances-view";
import { listInstances } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Instances · VWS" };

export default async function Page() {
  await connection();
  const result = await listInstances();
  return <InstancesView instances={result.ok ? result.value : []} loadError={result.ok ? null : result.error} />;
}
