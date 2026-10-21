import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { UploadView } from "@/components/sites/console/upload-view";
import { parseStoredBucketName } from "@/lib/vws-api/adapter";
import { getBucket } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Upload · VWS" };

export default async function Page({ params }: { params: Promise<{ name: string }> }) {
  await connection();
  const { name: raw } = await params;
  const name = decodeURIComponent(raw);
  const parsed = parseStoredBucketName(name);
  if (!parsed) {
    return (
      <Suspense>
        <UploadView name={name} bucket={null} loadError={null} />
      </Suspense>
    );
  }
  const result = await getBucket(parsed);
  return (
    <Suspense>
      <UploadView name={name} bucket={result.ok ? result.value : null} loadError={result.ok ? null : result.error} />
    </Suspense>
  );
}
