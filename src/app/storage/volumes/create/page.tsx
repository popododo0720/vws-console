import type { Metadata } from "next";
import { connection } from "next/server";
import { CreateVolumeView } from "@/components/sites/console/create-volume-view";
import { ZONES } from "@/lib/vws-api/adapter";
import { listSnapshots } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Create volume · VWS" };

export default async function Page({ searchParams }: { searchParams: Promise<{ snapshotId?: string | string[] }> }) {
  await connection();
  const [{ snapshotId }, snapshots] = await Promise.all([searchParams, listSnapshots()]);
  return (
    <CreateVolumeView
      snapshots={snapshots.ok ? snapshots.value : []}
      snapshotsError={snapshots.ok ? null : snapshots.error}
      zones={[...ZONES]}
      initialSnapshotId={typeof snapshotId === "string" ? snapshotId : ""}
    />
  );
}
