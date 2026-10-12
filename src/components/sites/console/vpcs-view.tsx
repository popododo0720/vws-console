"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CircleCheck } from "lucide-react";
import type { Vpc } from "@/types/console";
import { networkNav } from "@/lib/console-data";
import { useConsole } from "@/components/sites/console/console-provider";
import { DetailDock } from "@/components/sites/console/detail-dock";
import { PageHeader } from "@/components/sites/console/page-header";
import { Column, NameCell, ResourceTable } from "@/components/sites/console/resource-table";
import { Shell } from "@/components/sites/console/shell";
import {
  CopyText,
  FieldLabel,
  MenuButton,
  MenuChevron,
  OrangeButton,
  OutlineButton,
  PanelDialog,
  SampleBadge,
  dash,
  menuTriggerClass,
} from "@/components/sites/console/ui";

export function VpcsView() {
  const api = useConsole();
  const initial = useSearchParams().get("vpc") ?? "all";
  const [vpcFilter, setVpcFilter] = useState(initial);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dock, setDock] = useState(200);
  const [updated, setUpdated] = useState("Last updated less than a minute ago");
  const [createOpen, setCreateOpen] = useState(false);
  const [vpcTab, setVpcTab] = useState("details");
  const [form, setForm] = useState({ name: "", ipv4Cidr: "10.1.0.0/16" });
  const rows = vpcFilter === "all" ? api.vpcs : api.vpcs.filter((item) => item.id === vpcFilter);
  const selected = rows.filter((item) => selectedIds.includes(item.id));
  const one = selected.length === 1 ? selected[0] : null;

  const columns: Column<Vpc>[] = [
    { key: "name", header: "Name", minWidth: 120, sortValue: (row) => row.name, cell: (row) => <NameCell value={row.name} /> },
    { key: "id", header: "VPC ID", minWidth: 190, sortValue: (row) => row.id, cell: (row) => <CopyText value={row.id} /> },
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
    { key: "encryption", header: "Encryption", minWidth: 120, sortValue: (row) => row.encryption, cell: (row) => dash(row.encryption === "—" ? "" : row.encryption) },
    { key: "control", header: "Encryption control", minWidth: 150, sortValue: (row) => row.encryptionControl, cell: (row) => dash(row.encryptionControl === "—" ? "" : row.encryptionControl) },
    { key: "block", header: "Block public access", minWidth: 150, sortValue: (row) => row.blockPublicAccess, cell: (row) => (row.blockPublicAccess === "off" ? "Off" : "On") },
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
            {api.vpcs.map((vpc) => (
              <option key={vpc.id} value={vpc.id}>
                {vpc.name || vpc.id}
              </option>
            ))}
          </select>
        </label>
      }
    >
      <div className="border-b border-[#e6e8eb] px-4 pt-3">
        <div className="flex gap-4 text-[14px]">
          <span className="border-b-2 border-[#006ce0] pb-2 font-semibold text-[#006ce0]">VPCs</span>
          <span className="pb-2 text-[#5f6b7a]">VPC encryption controls</span>
        </div>
      </div>
      <PageHeader
        mark="N"
        crumbs={[{ label: "VPC", href: "/network/vpcs" }, { label: `Your VPCs (${rows.length})` }]}
        info="A VPC is an isolated network in the current region."
        meta={
          <span className="inline-flex items-center gap-2">
            {api.mode === "sample" ? <SampleBadge /> : null}
            {updated}
          </span>
        }
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
                  onSelect: () => {
                    api.deleteVpcs(selected.map((item) => item.id));
                    setSelectedIds([]);
                  },
                },
              ]}
            />
            <OrangeButton onClick={() => setCreateOpen(true)}>Create VPC</OrangeButton>
          </>
        }
      />
      <ResourceTable
        rows={rows}
        getId={(row) => row.id}
        columns={columns}
        selectedIds={selected.map((item) => item.id)}
        onSelectedIds={setSelectedIds}
        emptyTitle="No VPCs"
        emptyMessage="You do not have any VPCs in this region"
        filterPlaceholder="Filter VPCs by attribute or tag"
        presets={[{ id: "off", label: "Block public access off", match: (row) => row.blockPublicAccess === "off" }]}
        onRefresh={() => setUpdated("Last updated less than a minute ago")}
      />
      <DetailDock
        title={one ? one.name || one.id : "VPC"}
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
                <dd>{api.subnets.filter((item) => item.vpcId === one.id).map((item) => item.id).join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[#5f6b7a]">Route tables</dt>
                <dd>{api.routeTables.filter((item) => item.vpcId === one.id).map((item) => item.id).join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[#5f6b7a]">Internet gateways</dt>
                <dd>{api.internetGateways.filter((item) => item.vpcId === one.id).map((item) => item.id).join(", ") || "—"}</dd>
              </div>
            </dl>
          ) : vpcTab === "cidrs" ? (
            <p className="text-[13px]">IPv4 {one.ipv4Cidr} · IPv6 {dash(one.ipv6Cidr)}</p>
          ) : (
            <dl className="grid gap-3 text-[13px] sm:grid-cols-3">
              <div><dt className="text-[#5f6b7a]">VPC ID</dt><dd>{one.id}</dd></div>
              <div><dt className="text-[#5f6b7a]">IPv4 CIDR</dt><dd>{one.ipv4Cidr}</dd></div>
              <div><dt className="text-[#5f6b7a]">Block public access</dt><dd>{one.blockPublicAccess === "off" ? "Off" : "On"}</dd></div>
            </dl>
          )
        ) : (
          <p className="py-8 text-center text-[14px] text-[#5f6b7a]">Select a VPC above</p>
        )}
      </DetailDock>
      <PanelDialog
        open={createOpen}
        title="Create VPC"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <OutlineButton onClick={() => setCreateOpen(false)}>Cancel</OutlineButton>
            <OrangeButton
              onClick={() => {
                api.createVpc(form);
                setCreateOpen(false);
              }}
            >
              Create VPC
            </OrangeButton>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <FieldLabel>Name</FieldLabel>
            <input className="field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>
          <div>
            <FieldLabel>IPv4 CIDR</FieldLabel>
            <input className="field" value={form.ipv4Cidr} onChange={(event) => setForm({ ...form, ipv4Cidr: event.target.value })} />
          </div>
        </div>
      </PanelDialog>
    </Shell>
  );
}
