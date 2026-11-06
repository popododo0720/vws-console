import type { Metadata } from "next";
import { connection } from "next/server";
import { VolumesView } from "@/components/sites/console/volumes-view";
import { listVolumes } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Volumes · VWS" };

export default async function Page() {
  await connection();
  const volumes = await listVolumes();
  return (
    <VolumesView
      volumes={volumes.ok ? volumes.value : []}
      loadError={volumes.ok ? null : volumes.error}
      loadedAt={new Date().toISOString()}
    />
  );
}
