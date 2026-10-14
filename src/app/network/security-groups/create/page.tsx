import type { Metadata } from "next";
import { connection } from "next/server";
import { SecurityGroupCreateView } from "@/components/sites/console/security-group-create-view";
import { listVpcs } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Create security group · VWS" };

export default async function Page() {
  await connection();
  const result = await listVpcs();
  return <SecurityGroupCreateView vpcs={result.ok ? result.value : []} loadError={result.ok ? null : result.error} />;
}
