import type { Metadata } from "next";
import { Suspense } from "react";
import { GatewaysView } from "@/components/sites/console/gateways-view";

export const metadata: Metadata = { title: "Internet gateways · VWS" };

export default function Page() {
  return (
    <Suspense>
      <GatewaysView />
    </Suspense>
  );
}
