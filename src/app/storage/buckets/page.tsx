import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { BucketsView } from "@/components/sites/console/buckets-view";
import { listBuckets } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Buckets · VWS" };

export default async function Page() {
  await connection();
  const result = await listBuckets();
  return (
    <Suspense>
      <BucketsView buckets={result.ok ? result.value : []} loadError={result.ok ? null : result.error} />
    </Suspense>
  );
}
