"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { computeNav } from "@/lib/console-data";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { deleteSecurityGroupsAction } from "@/app/actions/resources";
import type { ApiError } from "@/lib/vws-api/adapter";
import type { SecurityGroup } from "@/types/console";
import { PageHeader } from "@/components/sites/console/page-header";
import { Shell } from "@/components/sites/console/shell";
import { OUTBOUND_UNAVAILABLE, RulesTable } from "@/components/sites/console/sg-rules-table";
import {
  CopyText,
  DetailGrid,
  MenuButton,
  MenuChevron,
  OutlineButton,
  dash,
  menuTriggerClass,
} from "@/components/sites/console/ui";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";

const crumbBase = [
  { label: "EC2", href: "/compute/instances" },
  { label: "Security Groups", href: "/network/security-groups" },
];

export function SecurityGroupDetailView({
  id,
  group,
  loadError,
}: {
  id: string;
  group: SecurityGroup | null;
  loadError: ApiError | null;
}) {
  const action = useApiAction();
  const router = useRouter();
  const [tab, setTab] = useState("in");

  if (!group) {
    return (
      <Shell tree={computeNav}>
        <PageHeader crumbs={[...crumbBase, { label: id }]} />
        <ApiErrorAlert error={loadError} title="Security groups could not be loaded" />
        <div className="px-4 py-6 text-[13px]">
          <p className="font-semibold">Security group not found</p>
          <p className="mt-1 text-[#5f6b7a]">{id} is not in this region.</p>
          <Link href="/network/security-groups" className="mt-3 inline-block text-[#006ce0] hover:underline">
            Back to security groups
          </Link>
        </div>
      </Shell>
    );
  }

  const inCount = group.rules.length;
  const isDefault = group.groupName === "default";
  const tabs = [
    { id: "in", label: `Inbound rules (${inCount})` },
    { id: "out", label: "Outbound rules (—)" },
  ];
  return (
    <Shell tree={computeNav}>
      <PageHeader
        crumbs={[...crumbBase, { label: `${group.id} - ${group.groupName}` }]}
        info="A single security group in the current region, read from the VWS API."
        actions={
          <MenuButton
            className={menuTriggerClass()}
            label={
              <>
                Actions <MenuChevron />
              </>
            }
            items={[
              {
                label: "Add inbound rules",
                onSelect: () => router.push(`/network/security-groups/${group.id}/edit/inbound`),
              },
              {
                label: "Copy security group ID",
                onSelect: () => void copyToClipboard(group.id, "security-group-detail-view"),
              },
              {
                label: "Delete security groups",
                disabled: isDefault || action.pending,
                onSelect: () =>
                  action.run(
                    () => deleteSecurityGroupsAction([group.id]),
                    () => router.push("/network/security-groups"),
                  ),
              },
            ]}
          />
        }
      />
      <ApiErrorAlert error={action.error} title="The security group action failed" />
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-6 text-[13px]">
        <section className="rounded-lg border border-[#d5dbdb] p-4">
          <h2 className="mb-3 text-[16px] font-semibold">Details</h2>
          <DetailGrid
            items={[
              ["Security group name", group.groupName],
              ["Security group ID", <CopyText key="id" value={group.id} />],
              ["Description", dash(group.description)],
              [
                "VPC ID",
                group.vpcId ? (
                  <Link key="vpc" href={`/network/vpcs?vpc=${group.vpcId}`} className="text-[#006ce0] hover:underline">
                    {group.vpcId}
                  </Link>
                ) : (
                  "—"
                ),
              ],
              ["Owner", dash(group.owner)],
              ["Inbound rules count", `${inCount} Permission entr${inCount === 1 ? "y" : "ies"}`],
              ["Outbound rules count", "—"],
            ]}
          />
        </section>
        <section className="mt-4 rounded-lg border border-[#d5dbdb]">
          <div className="flex gap-4 border-b border-[#e6e8eb] px-4">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "border-b-2 py-2",
                  tab === item.id
                    ? "border-[#006ce0] font-semibold text-[#006ce0]"
                    : "border-transparent text-[#5f6b7a]",
                )}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="p-4">
            {tab === "in" ? (
              <div className="mb-3 flex justify-end">
                <OutlineButton onClick={() => router.push(`/network/security-groups/${group.id}/edit/inbound`)}>
                  Add inbound rules
                </OutlineButton>
              </div>
            ) : null}
            <RulesTable
              rules={group.rules}
              direction="in"
              unavailable={tab === "out" ? OUTBOUND_UNAVAILABLE : undefined}
            />
          </div>
        </section>
      </div>
    </Shell>
  );
}
