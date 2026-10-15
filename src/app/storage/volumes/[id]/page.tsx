import type { Metadata } from "next";
import { connection } from "next/server";
import { VolumeDetailView } from "@/components/sites/console/volume-detail-view";
import { getVolume } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Volume details · VWS" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const result = await getVolume(id);
  return (
    <VolumeDetailView id={id} volume={result.ok ? result.value : null} loadError={result.ok ? null : result.error} />
  );
}
