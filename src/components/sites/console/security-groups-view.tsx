"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SecurityGroup } from "@/types/console";
import { computeNav } from "@/lib/console-data";
import { useConsole } from "@/components/sites/console/console-provider";
import { DetailDock } from "@/components/sites/console/detail-dock";
import { PageHeader } from "@/components/sites/console/page-header";
import { Column, NameCell, ResourceTable } from "@/components/sites/console/resource-table";
import { Shell } from "@/components/sites/console/shell";
import {
  CopyText,
  MenuButton,
  MenuChevron,
  OrangeButton,
  OutlineButton,
  dash,
  menuTriggerClass,
} from "@/components/sites/console/ui";

export function SecurityGroupsView() {
  const api = useConsole();
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dock, setDock] = useState(220);
  const [updated, setUpdated] = useState("Last updated less than a minute ago");
  const [ruleTab, setRuleTab] = useState("in");
  const selected = api.securityGroups.filter((item) => selectedIds.includes(item.id));
  const one = selected.length === 1 ? selected[0] : null;

  const columns: Column<SecurityGroup>[] = [
    { key: "name", header: "Name", minWidth: 120, sortValue: (row) => row.name, cell: (row) => <NameCell value={row.name} /> },
    { key: "id", header: "Security group ID", minWidth: 190, sortValue: (row) => row.id, cell: (row) => <CopyText value={row.id} /> },
    { key: "group", header: "Security group name", minWidth: 180, sortValue: (row) => row.groupName, cell: (row) => row.groupName },
    {
      key: "vpc",
      header: "VPC ID",
      minWidth: 180,
      sortValue: (row) => row.vpcId,
      cell: (row) =>
        row.vpcId ? (
          <Link href={`/network/vpcs?vpc=${row.vpcId}`} className="text-[#006ce0] hover:underline" onClick={(event) => event.stopPropagation()}>
            {row.vpcId}
          </Link>
        ) : (
          "—"
        ),
    },
    { key: "description", header: "Description", minWidth: 220, sortValue: (row) => row.description, cell: (row) => row.description },
    { key: "owner", header: "Owner", minWidth: 140, sortValue: (row) => row.owner, cell: (row) => row.owner },
  ];

  return (
    <Shell tree={computeNav}>
      <PageHeader
        mark="C"
        crumbs={[{ label: "EC2", href: "/compute/instances" }, { label: `Security Groups (${api.securityGroups.length})` }]}
        info="A security group is a set of allow rules for instances in a VPC."
        meta={updated}
        actions={
          <>
            <MenuButton
              className={menuTriggerClass()}
              label={
                <>
                  Actions <MenuChevron />
                </>
              }
              items={[
                {
                  label: "Delete",
                  disabled: selected.length === 0,
                  onSelect: () => api.deleteSecurityGroups(selected.map((item) => item.id)),
                },
              ]}
            />
            <OutlineButton
              onClick={() => {
                const lines = api.securityGroups.map((item) => [item.id, item.groupName, item.vpcId, item.description].join(","));
                void navigator.clipboard.writeText(["id,name,vpc,description", ...lines].join("\n"));
              }}
            >
              Export security groups to CSV
            </OutlineButton>
            <OrangeButton onClick={() => router.push("/network/security-groups/create")}>Create security group</OrangeButton>
          </>
        }
      />
      <ResourceTable
        rows={api.securityGroups}
        getId={(row) => row.id}
        columns={columns}
        selectedIds={selected.map((item) => item.id)}
        onSelectedIds={setSelectedIds}
        emptyTitle="No security groups"
        emptyMessage="You do not have any security groups in this region"
        filterPlaceholder="Find security groups by attribute or tag"
        presets={[{ id: "default", label: "Default groups", match: (row) => row.groupName === "default" }]}
        onRefresh={() => setUpdated("Last updated less than a minute ago")}
      />
      <DetailDock
        title={one ? one.groupName : "Security group"}
        tabs={one ? [{ id: "in", label: "Inbound rules" }, { id: "out", label: "Outbound rules" }] : undefined}
        tab={ruleTab}
        onTab={setRuleTab}
        height={dock}
        onHeight={setDock}
      >
        {one ? (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#e6e8eb] text-[#5f6b7a]">
                <th className="py-1 pr-3 font-semibold">Protocol</th>
                <th className="py-1 pr-3 font-semibold">Port</th>
                <th className="py-1 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody>
              {one.rules.filter((rule) => rule.direction === ruleTab).map((rule, index) => (
                <tr key={`${rule.direction}-${rule.port}-${index}`} className="border-b border-[#f2f3f3]">
                  <td className="py-1 pr-3">{rule.protocol}</td>
                  <td className="py-1 pr-3">{rule.port}</td>
                  <td className="py-1">{dash(rule.source)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="py-8 text-center text-[14px] text-[#5f6b7a]">Select a security group</p>
        )}
      </DetailDock>
    </Shell>
  );
}
