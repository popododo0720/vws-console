import type { Metadata } from "next";
import { Suspense } from "react";
import { RouteTablesView } from "@/components/sites/console/route-tables-view";

export const metadata: Metadata = { title: "Route tables · VWS" };

export default function Page() {
  return (
    <Suspense>
      <RouteTablesView />
    </Suspense>
  );
}
