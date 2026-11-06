import type { Metadata } from "next";
import { connection } from "next/server";
import { AttachVolumeView } from "@/components/sites/console/attach-volume-view";
import { getVolume, listInstances } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Attach volume · VWS" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const [volume, instances] = await Promise.all([getVolume(id), listInstances()]);
  return (
    <AttachVolumeView
      id={id}
      volume={volume.ok ? volume.value : null}
      volumeError={volume.ok ? null : volume.error}
      instances={instances.ok ? instances.value : []}
      instancesError={instances.ok ? null : instances.error}
    />
  );
}
