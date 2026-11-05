import type { Metadata } from "next";
import { connection } from "next/server";
import { CreateSnapshotView } from "@/components/sites/console/create-snapshot-view";
import { listVolumes } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Create snapshot · VWS" };

export default async function Page({ searchParams }: { searchParams: Promise<{ volumeId?: string | string[] }> }) {
  await connection();
  const [{ volumeId }, volumes] = await Promise.all([searchParams, listVolumes()]);
  return (
    <CreateSnapshotView
      volumes={volumes.ok ? volumes.value : []}
      volumesError={volumes.ok ? null : volumes.error}
      initialVolumeId={typeof volumeId === "string" ? volumeId : ""}
    />
  );
}
