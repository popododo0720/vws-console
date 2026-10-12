import type { Metadata } from "next";
import { SecurityGroupsView } from "@/components/sites/console/security-groups-view";

export const metadata: Metadata = { title: "Security groups · VWS" };

export default function Page() {
  return <SecurityGroupsView />;
}
