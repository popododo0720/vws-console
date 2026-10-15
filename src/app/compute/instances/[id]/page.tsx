import type { Metadata } from "next";
import { connection } from "next/server";
import { InstanceDetailView } from "@/components/sites/console/instance-detail-view";
import { getInstance } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Instance details · VWS" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const result = await getInstance(id);
  return (
    <InstanceDetailView
      id={id}
      instance={result.ok ? result.value : null}
      loadError={result.ok ? null : result.error}
    />
  );
}
