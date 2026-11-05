import type { Metadata } from "next";
import { connection } from "next/server";
import { SnapshotsView } from "@/components/sites/console/snapshots-view";
import { listSnapshots } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Snapshots · VWS" };

export default async function Page() {
  await connection();
  const snapshots = await listSnapshots();
  return (
    <SnapshotsView snapshots={snapshots.ok ? snapshots.value : []} loadError={snapshots.ok ? null : snapshots.error} />
  );
}
