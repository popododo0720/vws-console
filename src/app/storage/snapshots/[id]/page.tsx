import type { Metadata } from "next";
import { connection } from "next/server";
import { SnapshotDetailView } from "@/components/sites/console/snapshot-detail-view";
import { listSnapshots } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Snapshot details · VWS" };

/** console-api has no single-snapshot read, so the page finds the snapshot in the list. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const result = await listSnapshots();
  return (
    <SnapshotDetailView
      id={id}
      snapshot={result.ok ? (result.value.find((item) => item.id === id) ?? null) : null}
      loadError={result.ok ? null : result.error}
    />
  );
}
