import type { Metadata } from "next";
import { connection } from "next/server";
import { VolumesView } from "@/components/sites/console/volumes-view";
import { listInstances, listVolumes } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Volumes · VWS" };

export default async function Page() {
  await connection();
  const [volumes, instances] = await Promise.all([listVolumes(), listInstances()]);
  return (
    <VolumesView
      volumes={volumes.ok ? volumes.value : []}
      loadError={volumes.ok ? null : volumes.error}
      instances={instances.ok ? instances.value : []}
      instanceLoadError={instances.ok ? null : instances.error}
    />
  );
}
