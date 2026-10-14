import type { Metadata } from "next";
import { connection } from "next/server";
import { SnapshotsView } from "@/components/sites/console/snapshots-view";
import { listSnapshots, listVolumes } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Snapshots · VWS" };

export default async function Page() {
  await connection();
  const [snapshots, volumes] = await Promise.all([listSnapshots(), listVolumes()]);
  return (
    <SnapshotsView
      snapshots={snapshots.ok ? snapshots.value : []}
      volumes={volumes.ok ? volumes.value : []}
      loadError={snapshots.ok ? (volumes.ok ? null : volumes.error) : snapshots.error}
    />
  );
}
