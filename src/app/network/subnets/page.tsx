import type { Metadata } from "next";
import { Suspense } from "react";
import { SubnetsView } from "@/components/sites/console/subnets-view";

export const metadata: Metadata = { title: "Subnets · VWS" };

export default function Page() {
  return (
    <Suspense>
      <SubnetsView />
    </Suspense>
  );
}
