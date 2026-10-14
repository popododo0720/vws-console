import type { Metadata } from "next";
import { connection } from "next/server";
import { InstancesView } from "@/components/sites/console/instances-view";
import { describeInstances } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Instances · VWS" };

export default async function Page() {
  await connection();
  const result = await describeInstances();
  return <InstancesView instances={result.ok ? result.value : []} loadError={result.ok ? null : result.error} />;
}
