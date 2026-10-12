import type { Metadata } from "next";
import { Suspense } from "react";
import { BucketDetailView } from "@/components/sites/console/bucket-detail-view";

export const metadata: Metadata = { title: "Bucket · VWS" };

export default async function Page({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return (
    <Suspense>
      <BucketDetailView name={decodeURIComponent(name)} />
    </Suspense>
  );
}
