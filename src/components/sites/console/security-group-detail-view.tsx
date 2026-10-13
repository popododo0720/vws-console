"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { computeNav } from "@/lib/console-data";
import { useConsole } from "@/components/sites/console/console-provider";
import { PageHeader } from "@/components/sites/console/page-header";
import { Shell } from "@/components/sites/console/shell";
import { RulesTable } from "@/components/sites/console/sg-rules-table";
import { CopyText, DetailGrid, MenuButton, MenuChevron, OutlineButton, SampleBadge, dash, menuTriggerClass } from "@/components/sites/console/ui";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";

const crumbBase = [{ label: "EC2", href: "/compute/instances" }, { label: "Security Groups", href: "/network/security-groups" }];

export function SecurityGroupDetailView({ id }: { id: string }) {
  const api = useConsole();
  const router = useRouter();
  const [tab, setTab] = useState("in");
  const group = api.securityGroups.find((item) => item.id === id);

  if (!group) {
    return (
      <Shell tree={computeNav}>
        <PageHeader crumbs={[...crumbBase, { label: id }]} />
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

  const inCount = group.rules.filter((rule) => rule.direction === "in").length;
  const outCount = group.rules.filter((rule) => rule.direction === "out").length;
  const isDefault = group.groupName === "default";
  const tabs = [
    { id: "in", label: `Inbound rules (${inCount})` },
    { id: "out", label: `Outbound rules (${outCount})` },
  ];
  return (
    <Shell tree={computeNav}>
      <PageHeader
        crumbs={[...crumbBase, { label: `${group.id} - ${group.groupName}` }]}
        info="A single security group in the current region. This is local sample data."
        meta={api.mode === "sample" ? <SampleBadge /> : null}
        actions={
          <MenuButton
            className={menuTriggerClass()}
            label={<>Actions <MenuChevron /></>}
            items={[
              { label: "Edit inbound rules", onSelect: () => router.push(`/network/security-groups/${group.id}/edit/inbound`) },
              { label: "Edit outbound rules", onSelect: () => router.push(`/network/security-groups/${group.id}/edit/outbound`) },
              { label: "Copy security group ID", onSelect: () => void copyToClipboard(group.id, "security-group-detail-view") },
              {
                label: "Delete security groups",
                disabled: isDefault,
                onSelect: () => {
                  api.deleteSecurityGroups([group.id]);
                  router.push("/network/security-groups");
                },
              },
            ]}
          />
        }
      />
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-6 text-[13px]">
        <section className="rounded-lg border border-[#d5dbdb] p-4">
          <h2 className="mb-3 text-[16px] font-semibold">Details</h2>
          <DetailGrid
            items={[
              ["Security group name", group.groupName],
              ["Security group ID", <CopyText key="id" value={group.id} />],
              ["Description", dash(group.description)],
              ["VPC ID", group.vpcId ? <Link key="vpc" href={`/network/vpcs?vpc=${group.vpcId}`} className="text-[#006ce0] hover:underline">{group.vpcId}</Link> : "—"],
              ["Owner", dash(group.owner)],
              ["Inbound rules count", `${inCount} Permission entr${inCount === 1 ? "y" : "ies"}`],
              ["Outbound rules count", `${outCount} Permission entr${outCount === 1 ? "y" : "ies"}`],
            ]}
          />
        </section>
        <section className="mt-4 rounded-lg border border-[#d5dbdb]">
          <div className="flex gap-4 border-b border-[#e6e8eb] px-4">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn("border-b-2 py-2", tab === item.id ? "border-[#006ce0] font-semibold text-[#006ce0]" : "border-transparent text-[#5f6b7a]")}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="p-4">
            <div className="mb-3 flex justify-end">
              <OutlineButton onClick={() => router.push(`/network/security-groups/${group.id}/edit/${tab === "in" ? "inbound" : "outbound"}`)}>
                {tab === "in" ? "Edit inbound rules" : "Edit outbound rules"}
              </OutlineButton>
            </div>
            <RulesTable rules={group.rules} direction={tab === "in" ? "in" : "out"} />
          </div>
        </section>
      </div>
    </Shell>
  );
}
