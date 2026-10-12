import type { Metadata } from "next";
import { Suspense } from "react";
import { VpcsView } from "@/components/sites/console/vpcs-view";

export const metadata: Metadata = { title: "Your VPCs · VWS" };

export default function Page() {
  return (
    <Suspense>
      <VpcsView />
    </Suspense>
  );
}
