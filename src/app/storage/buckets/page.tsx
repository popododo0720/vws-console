import type { Metadata } from "next";
import { Suspense } from "react";
import { BucketsView } from "@/components/sites/console/buckets-view";

export const metadata: Metadata = { title: "Buckets · VWS" };

export default function Page() {
  return (
    <Suspense>
      <BucketsView />
    </Suspense>
  );
}
