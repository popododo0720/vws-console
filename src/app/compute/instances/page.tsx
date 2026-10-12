import type { Metadata } from "next";
import { InstancesView } from "@/components/sites/console/instances-view";

export const metadata: Metadata = { title: "Instances · VWS" };

export default function Page() {
  return <InstancesView />;
}
