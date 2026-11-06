import type { Metadata } from "next";
import { Suspense } from "react";
import { NatGatewaysView } from "@/components/sites/console/nat-gateways-view";

export const metadata: Metadata = { title: "NAT gateways · VWS" };

export default function Page() {
  return (
    <Suspense>
      <NatGatewaysView />
    </Suspense>
  );
}
