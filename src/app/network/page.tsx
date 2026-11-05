import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { VpcDashboardView, type DashboardLoadError } from "@/components/sites/console/vpc-dashboard-view";
import { listAddresses, listSecurityGroups, listSubnets, listVpcs } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "VPC dashboard · VWS" };

export default async function Page() {
  await connection();
  const [vpcs, subnets, securityGroups, addresses] = await Promise.all([
    listVpcs(),
    listSubnets(),
    listSecurityGroups(),
    listAddresses(),
  ]);
  const loadErrors: DashboardLoadError[] = [];
  if (!vpcs.ok) loadErrors.push({ label: "VPCs", error: vpcs.error });
  if (!subnets.ok) loadErrors.push({ label: "Subnets", error: subnets.error });
  if (!securityGroups.ok) loadErrors.push({ label: "Security groups", error: securityGroups.error });
  if (!addresses.ok) loadErrors.push({ label: "Elastic IP addresses", error: addresses.error });
  return (
    <Suspense>
      <VpcDashboardView
        vpcs={vpcs.ok ? vpcs.value : null}
        subnets={subnets.ok ? subnets.value : null}
        securityGroups={securityGroups.ok ? securityGroups.value : null}
        addresses={addresses.ok ? addresses.value : null}
        loadErrors={loadErrors}
      />
    </Suspense>
  );
}
