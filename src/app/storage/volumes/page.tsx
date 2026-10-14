import type { Metadata } from "next";
import { connection } from "next/server";
import { VolumesView } from "@/components/sites/console/volumes-view";
import { listVolumes } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Volumes · VWS" };

export default async function Page() {
  await connection();
  const result = await listVolumes();
  return <VolumesView volumes={result.ok ? result.value : []} loadError={result.ok ? null : result.error} />;
}
