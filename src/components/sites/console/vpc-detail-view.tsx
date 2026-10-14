"use client";

import type { Subnet, Vpc } from "@/types/console";
import type { ApiError } from "@/lib/vws-api/adapter";
import { networkNav } from "@/lib/console-data";
import { TagsTable } from "@/components/sites/console/tags-table";
import { ResourceDetail } from "@/components/sites/console/resource-detail";
import { CopyText, dash } from "@/components/sites/console/ui";

export function VpcDetailView({ id, vpc, subnets, loadError }: { id: string; vpc: Vpc | null; subnets: Subnet[]; loadError: ApiError | null }) {
  const own = vpc ? subnets.filter((item) => item.vpcId === vpc.id) : [];
  return (
    <ResourceDetail
      tree={networkNav}
      crumbs={[{ label: "VPC", href: "/network/vpcs" }, { label: "Your VPCs", href: "/network/vpcs" }]}
      kind="VPC"
      id={id}
      backHref="/network/vpcs"
      found={Boolean(vpc)}
      loadError={loadError}
      items={
        vpc
          ? [
              ["Name", dash(vpc.name)],
              ["VPC ID", <CopyText key="id" value={vpc.id} />],
              ["State", vpc.state === "available" ? "Available" : "Pending"],
              ["IPv4 CIDR", vpc.ipv4Cidr],
              ["IPv6 CIDR", dash(vpc.ipv6Cidr)],
              ["Default VPC", vpc.isDefault === null ? "—" : vpc.isDefault ? "Yes" : "No"],
              ["Owner ID", dash(vpc.owner)],
              ["Block Public Access", dash(vpc.blockPublicAccess)],
            ]
          : []
      }
    >
      <section className="rounded-lg border border-[#d5dbdb] p-4">
        <h2 className="mb-2 text-[16px] font-semibold">Tags</h2>
        <TagsTable tags={vpc?.tags ?? {}} />
      </section>
      <section className="rounded-lg border border-[#d5dbdb] p-4">
        <h2 className="mb-2 text-[16px] font-semibold">Subnets ({own.length})</h2>
        {own.length === 0 ? (
          <p className="text-[#5f6b7a]">This VPC has no subnets.</p>
        ) : (
          <ul className="space-y-1">
            {own.map((item) => (
              <li key={item.id}>
                {item.id}{item.name ? ` (${item.name})` : ""} · {item.ipv4Cidr}
              </li>
            ))}
          </ul>
        )}
      </section>
    </ResourceDetail>
  );
}
