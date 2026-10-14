"use client";

import { DetailLink } from "@/components/sites/console/resource-detail";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CircleCheck } from "lucide-react";
import type { Subnet, Vpc } from "@/types/console";
import { networkNav } from "@/lib/console-data";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { createVpcAction, deleteVpcsAction } from "@/app/actions/resources";
import type { ApiError } from "@/lib/vws-api/adapter";
import { DetailDock } from "@/components/sites/console/detail-dock";
import { PageHeader } from "@/components/sites/console/page-header";
import { Column, NameCell, ResourceTable } from "@/components/sites/console/resource-table";
import { Shell } from "@/components/sites/console/shell";
import {
  FieldLabel,
  MenuButton,
  MenuChevron,
  OrangeButton,
  OutlineButton,
  PanelDialog,
  dash,
  menuTriggerClass,
} from "@/components/sites/console/ui";

function blockPublicAccess(value: Vpc["blockPublicAccess"]) {
  return value === "" ? "—" : value === "off" ? "Off" : "On";
}

export function VpcsView({ vpcs, subnets, loadError }: { vpcs: Vpc[]; subnets: Subnet[]; loadError: ApiError | null }) {
  const action = useApiAction();
  const initial = useSearchParams().get("vpc") ?? "all";
  const [vpcFilter, setVpcFilter] = useState(initial);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dock, setDock] = useState(200);
  const [createOpen, setCreateOpen] = useState(false);
  const [vpcTab, setVpcTab] = useState("details");
  const [cidr, setCidr] = useState("10.1.0.0/16");
  const rows = vpcFilter === "all" ? vpcs : vpcs.filter((item) => item.id === vpcFilter);
  const selected = rows.filter((item) => selectedIds.includes(item.id));
  const one = selected.length === 1 ? selected[0] : null;

  const columns: Column<Vpc>[] = [
    { key: "name", header: "Name", minWidth: 120, sortValue: (row) => row.name, cell: (row) => <NameCell value={row.name} /> },
    { key: "id", header: "VPC ID", minWidth: 190, sortValue: (row) => row.id, cell: (row) => <DetailLink href={`/network/vpcs/${row.id}`} id={row.id} /> },
    {
      key: "state",
      header: "State",
      minWidth: 130,
      sortValue: (row) => row.state,
      cell: (row) =>
        row.state === "available" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#e7f6e9] px-2 py-0.5 text-[12px] font-medium text-[#037f0c]">
            <CircleCheck className="size-3.5" />
            Available
          </span>
        ) : (
          <span className="text-[#006ce0]">Pending</span>
        ),
    },
    { key: "encryption", header: "Encryption", minWidth: 120, sortValue: (row) => row.encryption, cell: (row) => dash(row.encryption) },
    { key: "control", header: "Encryption control", minWidth: 150, sortValue: (row) => row.encryptionControl, cell: (row) => dash(row.encryptionControl) },
    { key: "block", header: "Block public access", minWidth: 150, sortValue: (row) => row.blockPublicAccess, cell: (row) => blockPublicAccess(row.blockPublicAccess) },
    { key: "cidr", header: "IPv4 CIDR", minWidth: 130, sortValue: (row) => row.ipv4Cidr, cell: (row) => row.ipv4Cidr },
    { key: "ipv6", header: "IPv6 CIDR", minWidth: 120, sortValue: (row) => row.ipv6Cidr, cell: (row) => dash(row.ipv6Cidr) },
  ];

  return (
    <Shell
      tree={networkNav}
      navHeader={
        <label className="block text-[12px]">
          Filter by VPC
          <select className="field mt-1" value={vpcFilter} onChange={(event) => setVpcFilter(event.target.value)}>
            <option value="all">Choose a VPC</option>
            {vpcs.map((vpc) => (
              <option key={vpc.id} value={vpc.id}>
                {vpc.name || vpc.id}
              </option>
            ))}
          </select>
        </label>
      }
    >
      <PageHeader
        mark="N"
        crumbs={[{ label: "VPC", href: "/network/vpcs" }, { label: "Your VPCs" }]}
        title={`Your VPCs (${rows.length})`}
        lead={
          <div className="border-b border-[#e6e8eb] px-4 pt-3">
            <p className="text-[20px] font-bold leading-7">Your VPCs</p>
            <div className="mt-2 flex gap-4 text-[14px]">
              <span className="border-b-2 border-[#006ce0] pb-2 font-semibold text-[#006ce0]">VPCs</span>
              <span className="pb-2 text-[#5f6b7a]">VPC encryption controls</span>
            </div>
          </div>
        }
        info="A VPC is an isolated network in the current region, read from the VWS API."
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
                  disabled: action.pending || selected.length === 0,
                  onSelect: () => action.run(() => deleteVpcsAction(selected.map((item) => item.id)), () => setSelectedIds([])),
                },
              ]}
            />
            <OrangeButton onClick={() => setCreateOpen(true)}>Create VPC</OrangeButton>
          </>
        }
      />
      <ApiErrorAlert error={loadError} title="VPCs could not be loaded" />
      <ApiErrorAlert error={action.error} title="The VPC action failed" />
      <ResourceTable
        rows={rows}
        getId={(row) => row.id}
        columns={columns}
        selectedIds={selected.map((item) => item.id)}
        onSelectedIds={setSelectedIds}
        emptyTitle="No VPCs"
        emptyMessage="You do not have any VPCs in this region"
        filterPlaceholder="Filter VPCs by attribute or tag"
        presets={[{ id: "default", label: "Default VPC", match: (row) => row.isDefault === true }]}
        onRefresh={action.refresh}
      />
      <DetailDock
        title={one ? one.name || one.id : "Select a VPC above"}
        tabs={one ? [{ id: "details", label: "Details" }, { id: "cidrs", label: "CIDRs" }, { id: "map", label: "Resource map" }] : undefined}
        tab={vpcTab}
        onTab={setVpcTab}
        height={dock}
        onHeight={setDock}
      >
        {one ? (
          vpcTab === "map" ? (
            <dl className="grid gap-3 text-[13px] sm:grid-cols-3">
              <div>
                <dt className="font-semibold text-[#5f6b7a]">Subnets</dt>
                <dd>{subnets.filter((item) => item.vpcId === one.id).map((item) => item.id).join(", ") || "—"}</dd>
              </div>
            </dl>
          ) : vpcTab === "cidrs" ? (
            <p className="text-[13px]">IPv4 {one.ipv4Cidr} · IPv6 {dash(one.ipv6Cidr)}</p>
          ) : (
            <dl className="grid gap-3 text-[13px] sm:grid-cols-3">
              <div><dt className="text-[#5f6b7a]">VPC ID</dt><dd>{one.id}</dd></div>
              <div><dt className="text-[#5f6b7a]">IPv4 CIDR</dt><dd>{one.ipv4Cidr}</dd></div>
              <div><dt className="text-[#5f6b7a]">Owner ID</dt><dd>{dash(one.owner)}</dd></div>
              <div><dt className="text-[#5f6b7a]">Default VPC</dt><dd>{one.isDefault === null ? "—" : one.isDefault ? "Yes" : "No"}</dd></div>
            </dl>
          )
        ) : null}
      </DetailDock>
      <PanelDialog
        open={createOpen}
        title="Create VPC"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <OutlineButton onClick={() => setCreateOpen(false)}>Cancel</OutlineButton>
            <OrangeButton disabled={action.pending} onClick={() => action.run(() => createVpcAction(cidr), () => setCreateOpen(false))}>
              Create VPC
            </OrangeButton>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <FieldLabel>IPv4 CIDR</FieldLabel>
            <input className="field" value={cidr} onChange={(event) => setCidr(event.target.value)} />
          </div>
          <ApiErrorAlert error={action.error} title="The VPC could not be created" />
        </div>
      </PanelDialog>
    </Shell>
  );
}
