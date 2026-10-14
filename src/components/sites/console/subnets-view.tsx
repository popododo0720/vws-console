"use client";

import { useState } from "react";
import type { Subnet, Vpc } from "@/types/console";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { createSubnetAction, deleteSubnetsAction, renameSubnetAction } from "@/app/actions/resources";
import type { ApiError } from "@/lib/vws-api/adapter";
import { NetworkList } from "@/components/sites/console/network-list";
import { Column, NameCell } from "@/components/sites/console/resource-table";
import { TagsTable } from "@/components/sites/console/tags-table";
import {
  CopyText,
  DetailGrid,
  FieldLabel,
  OrangeButton,
  OutlineButton,
  PanelDialog,
  dash,
} from "@/components/sites/console/ui";

function optional(value: number | boolean | null, show: (value: number | boolean) => string) {
  return value === null ? "—" : show(value);
}

export function SubnetsView({ subnets, vpcs, loadError }: { subnets: Subnet[]; vpcs: Vpc[]; loadError: ApiError | null }) {
  const action = useApiAction();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ vpcId: "", ipv4Cidr: "", name: "" });

  const columns: Column<Subnet>[] = [
    { key: "name", header: "Name", minWidth: 140, sortValue: (row) => row.name,
      cell: (row) => (
        <NameCell
          value={row.name}
          onRename={(name) => {
            if (name !== row.name) action.run(() => renameSubnetAction(row.id, name));
          }}
        />
      ),
    },
    { key: "id", header: "Subnet ID", minWidth: 190, sortValue: (row) => row.id, cell: (row) => <CopyText value={row.id} /> },
    { key: "state", header: "State", minWidth: 100, sortValue: (row) => row.state, cell: (row) => (row.state === "available" ? "Available" : "Pending") },
    { key: "vpc", header: "VPC", minWidth: 190, sortValue: (row) => row.vpcId, cell: (row) => <CopyText value={row.vpcId} /> },
    { key: "cidr", header: "IPv4 CIDR", minWidth: 130, sortValue: (row) => row.ipv4Cidr, cell: (row) => row.ipv4Cidr },
    { key: "ips", header: "Available IPv4 addresses", minWidth: 190, sortValue: (row) => String(row.availableIps ?? ""), cell: (row) => optional(row.availableIps, String) },
    { key: "az", header: "Availability Zone", minWidth: 150, sortValue: (row) => row.availabilityZone, cell: (row) => dash(row.availabilityZone) },
    { key: "rtb", header: "Route table", minWidth: 190, sortValue: (row) => row.routeTableId, cell: (row) => (row.routeTableId ? <CopyText value={row.routeTableId} /> : "—") },
  ];

  const openCreate = () => {
    setForm({ vpcId: vpcs[0]?.id ?? "", ipv4Cidr: "", name: "" });
    setCreateOpen(true);
  };

  return (
    <NetworkList
      title="Subnets"
      info="A subnet is a range of IP addresses in your VPC, read from the VWS API."
      rows={subnets}
      getId={(row) => row.id}
      columns={columns}
      vpcOf={(row) => row.vpcId}
      live={{
        vpcs,
        onRefresh: action.refresh,
        banner: (
          <>
            <ApiErrorAlert error={loadError} title="Subnets could not be loaded" />
            <ApiErrorAlert error={action.error} title="The subnet action failed" />
          </>
        ),
      }}
      actions={[{ label: "Delete subnet", disabled: (rows) => action.pending || rows.length === 0, onSelect: (rows) => action.run(() => deleteSubnetsAction(rows.map((row) => row.id))) }]}
      createLabel="Create subnet"
      onCreate={openCreate}
      emptyTitle="No subnets found"
      emptyMessage="You do not have any subnets in this region"
      filterPlaceholder="Find subnets by attribute or tag"
      detailTitle={(row) => `${row.id}${row.name ? ` / ${row.name}` : ""}`}
      detailTabs={[{ id: "details", label: "Details" }, { id: "tags", label: "Tags" }]}
      renderDetail={(row, tab) => {
        if (tab === "tags") return <TagsTable tags={row.tags} />;
        return (
          <DetailGrid
            items={[
              ["Subnet ID", row.id],
              ["State", row.state === "available" ? "Available" : "Pending"],
              ["VPC", row.vpcId],
              ["IPv4 CIDR", row.ipv4Cidr],
              ["Available IPv4 addresses", optional(row.availableIps, String)],
              ["Availability Zone", dash(row.availabilityZone)],
              ["Route table", dash(row.routeTableId)],
              ["Auto-assign public IPv4 address", optional(row.autoAssignPublicIp, (value) => (value ? "Yes" : "No"))],
              ["IPv6 CIDR", "—"],
            ]}
          />
        );
      }}
    >
      <PanelDialog
        open={createOpen}
        title="Create subnet"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <OutlineButton onClick={() => setCreateOpen(false)}>Cancel</OutlineButton>
            <OrangeButton disabled={action.pending} onClick={() => action.run(() => createSubnetAction(form.vpcId, form.ipv4Cidr, form.name), () => setCreateOpen(false))}>
              Create subnet
            </OrangeButton>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <FieldLabel>Name tag (optional)</FieldLabel>
            <input className="field" aria-label="Subnet name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>
          <div>
            <FieldLabel>VPC ID</FieldLabel>
            <select className="field" value={form.vpcId} onChange={(event) => setForm({ ...form, vpcId: event.target.value })}>
              {vpcs.map((vpc) => (
                <option key={vpc.id} value={vpc.id}>
                  {vpc.id} ({vpc.ipv4Cidr})
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>IPv4 subnet CIDR block</FieldLabel>
            <input className="field" placeholder="10.0.1.0/24" value={form.ipv4Cidr} onChange={(event) => setForm({ ...form, ipv4Cidr: event.target.value })} />
          </div>
          <ApiErrorAlert error={action.error} title="The subnet could not be created" />
        </div>
      </PanelDialog>
    </NetworkList>
  );
}
