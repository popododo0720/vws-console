import type { Metadata } from "next";
import { Suspense } from "react";
import { ElasticIpsView } from "@/components/sites/console/elastic-ips-view";

export const metadata: Metadata = { title: "Elastic IPs · VWS" };

export default function Page() {
  return (
    <Suspense>
      <ElasticIpsView />
    </Suspense>
  );
}
