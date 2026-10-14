"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SecurityGroup } from "@/types/console";
import { computeNav } from "@/lib/console-data";
import { downloadCsv } from "@/lib/csv";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { deleteSecurityGroupsAction } from "@/app/actions/resources";
import type { ApiError } from "@/lib/vws-api/adapter";
import { DetailDock } from "@/components/sites/console/detail-dock";
import { PageHeader } from "@/components/sites/console/page-header";
import { Column, NameCell, ResourceTable } from "@/components/sites/console/resource-table";
import { OUTBOUND_UNAVAILABLE, RulesTable } from "@/components/sites/console/sg-rules-table";
import { Shell } from "@/components/sites/console/shell";
import { cn } from "@/lib/utils";
import {
  MenuButton,
  MenuChevron,
  OrangeButton,
  OutlineButton,
  dash,
  menuTriggerClass,
} from "@/components/sites/console/ui";

export function SecurityGroupsView({ securityGroups, loadError }: { securityGroups: SecurityGroup[]; loadError: ApiError | null }) {
  const action = useApiAction();
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dock, setDock] = useState(220);
  const [updated, setUpdated] = useState("Last updated less than a minute ago");
  const [ruleTab, setRuleTab] = useState("in");
  const selected = securityGroups.filter((item) => selectedIds.includes(item.id));
  const one = selected.length === 1 ? selected[0] : null;
  const exportGroups = () =>
    downloadCsv("security-groups.csv", [
      ["Security group ID", "Security group name", "VPC ID", "Description", "Owner", "Inbound rules count", "Outbound rules count"],
      ...securityGroups.map((item) => [
        item.id,
        item.groupName,
        item.vpcId,
        "",
        item.owner,
        String(item.rules.length),
        "",
      ]),
    ]);
  const exportRules = () =>
    downloadCsv("security-group-rules.csv", [
      ["Security group ID", "Rule ID", "Direction", "Protocol", "Port range", "Source", "Description"],
      ...securityGroups.flatMap((item) =>
        item.rules.map((rule) => [item.id, rule.id, "Inbound", rule.protocol, rule.port, rule.source, rule.description]),
      ),
    ]);

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
    { key: "description", header: "Description", minWidth: 220, sortValue: (row) => row.description, cell: (row) => dash(row.description) },
    { key: "owner", header: "Owner", minWidth: 140, sortValue: (row) => row.owner, cell: (row) => dash(row.owner) },
    { key: "in", header: "Inbound rules count", minWidth: 150, sortValue: (row) => String(row.rules.length).padStart(4, "0"), cell: (row) => row.rules.length },
    { key: "out", header: "Outbound rules count", minWidth: 160, sortValue: () => "", cell: () => "—" },
  ];

  return (
    <Shell tree={computeNav}>
      <PageHeader
        mark="C"
        crumbs={[{ label: "EC2", href: "/compute/instances" }, { label: `Security Groups (${securityGroups.length})` }]}
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
                { label: "Add inbound rules", disabled: !one, onSelect: () => one && router.push(`/network/security-groups/${one.id}/edit/inbound`) },
                {
                  label: "Delete security groups",
                  disabled: action.pending || selected.length === 0 || selected.some((item) => item.groupName === "default"),
                  onSelect: () => action.run(() => deleteSecurityGroupsAction(selected.map((item) => item.id)), () => setSelectedIds([])),
                },
              ]}
            />
            <div className="flex">
              <OutlineButton className="rounded-r-none" onClick={exportGroups}>
                Export security groups to CSV
              </OutlineButton>
              <MenuButton
                align="right"
                className={cn(menuTriggerClass(), "rounded-l-none border-l-0 px-2")}
                label={
                  <>
                    <span className="sr-only">More export options</span>
                    <MenuChevron />
                  </>
                }
                items={[
                  { label: "Export security groups to CSV", onSelect: exportGroups },
                  { label: "Export security group rules to CSV", onSelect: exportRules },
                ]}
              />
            </div>
            <OrangeButton onClick={() => router.push("/network/security-groups/create")}>Create security group</OrangeButton>
          </>
        }
      />
      <ApiErrorAlert error={loadError} title="Security groups could not be loaded" />
      <ApiErrorAlert error={action.error} title="The security group action failed" />
      <ResourceTable
        rows={securityGroups}
        getId={(row) => row.id}
        columns={columns}
        selectedIds={selected.map((item) => item.id)}
        onSelectedIds={setSelectedIds}
        emptyTitle="No security groups"
        emptyMessage="You do not have any security groups in this region"
        filterPlaceholder="Find security groups by attribute or tag"
        presets={[{ id: "default", label: "Default groups", match: (row) => row.groupName === "default" }]}
        onRefresh={() => {
          setUpdated("Last updated less than a minute ago");
          action.refresh();
        }}
      />
      <DetailDock
        title={one ? one.groupName : "Select a security group"}
        tabs={one ? [{ id: "in", label: "Inbound rules" }, { id: "out", label: "Outbound rules" }] : undefined}
        tab={ruleTab}
        onTab={setRuleTab}
        height={dock}
        onHeight={setDock}
      >
        {one ? (
          <RulesTable rules={one.rules} direction="in" unavailable={ruleTab === "out" ? OUTBOUND_UNAVAILABLE : undefined} />
        ) : null}
      </DetailDock>
    </Shell>
  );
}
