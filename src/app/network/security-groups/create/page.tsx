import type { Metadata } from "next";
import { SecurityGroupCreateView } from "@/components/sites/console/security-group-create-view";

export const metadata: Metadata = { title: "Create security group · VWS" };

export default function Page() {
  return <SecurityGroupCreateView />;
}
