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
import { RulesTable } from "@/components/sites/console/sg-rules-table";
import { Shell } from "@/components/sites/console/shell";
import {
  MenuButton,
  MenuChevron,
  OrangeButton,
  OutlineButton,
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
    { key: "id", header: "Security group ID", minWidth: 190, sortValue: (row) => row.id, cell: (row) => (
        <Link href={`/network/security-groups/${row.id}`} className="text-[#006ce0] hover:underline" onClick={(event) => event.stopPropagation()}>
          {row.id}
        </Link>
      ),
    },
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
    { key: "in", header: "Inbound rules count", minWidth: 150, sortValue: (row) => String(row.rules.filter((rule) => rule.direction === "in").length).padStart(4, "0"), cell: (row) => `${row.rules.filter((rule) => rule.direction === "in").length} Permission entries` },
    { key: "out", header: "Outbound rules count", minWidth: 160, sortValue: (row) => String(row.rules.filter((rule) => rule.direction === "out").length).padStart(4, "0"), cell: (row) => `${row.rules.filter((rule) => rule.direction === "out").length} Permission entries` },
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
                { label: "View details", disabled: !one, onSelect: () => one && router.push(`/network/security-groups/${one.id}`) },
                { label: "Edit inbound rules", disabled: !one, onSelect: () => one && router.push(`/network/security-groups/${one.id}/edit/inbound`) },
                { label: "Edit outbound rules", disabled: !one, onSelect: () => one && router.push(`/network/security-groups/${one.id}/edit/outbound`) },
                {
                  label: "Delete security groups",
                  disabled: selected.length === 0 || selected.some((item) => item.groupName === "default"),
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
          <RulesTable rules={one.rules} direction={ruleTab === "out" ? "out" : "in"} />
        ) : (
          <p className="py-8 text-center text-[14px] text-[#5f6b7a]">Select a security group</p>
        )}
      </DetailDock>
    </Shell>
  );
}
