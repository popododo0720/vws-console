"use client";

import { useState } from "react";
import type { Subnet } from "@/types/console";
import { zonesFor } from "@/lib/console-data";
import { useConsole } from "@/components/sites/console/console-provider";
import { NetworkList } from "@/components/sites/console/network-list";
import { Column } from "@/components/sites/console/resource-table";
import {
  CopyText,
  DetailGrid,
  FieldLabel,
  OrangeButton,
  OutlineButton,
  PanelDialog,
  dash,
} from "@/components/sites/console/ui";

export function SubnetsView() {
  const api = useConsole();
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", vpcId: "", ipv4Cidr: "", availabilityZone: "" });
  const zones = zonesFor(api.region);

  const columns: Column<Subnet>[] = [
    { key: "name", header: "Name", minWidth: 140, sortValue: (row) => row.name, cell: (row) => dash(row.name) },
    { key: "id", header: "Subnet ID", minWidth: 190, sortValue: (row) => row.id, cell: (row) => <CopyText value={row.id} /> },
    { key: "state", header: "State", minWidth: 100, sortValue: (row) => row.state, cell: (row) => (row.state === "available" ? "Available" : "Pending") },
    { key: "vpc", header: "VPC", minWidth: 190, sortValue: (row) => row.vpcId, cell: (row) => <CopyText value={row.vpcId} /> },
    { key: "cidr", header: "IPv4 CIDR", minWidth: 130, sortValue: (row) => row.ipv4Cidr, cell: (row) => row.ipv4Cidr },
    { key: "ips", header: "Available IPv4 addresses", minWidth: 190, sortValue: (row) => String(row.availableIps), cell: (row) => String(row.availableIps) },
    { key: "az", header: "Availability Zone", minWidth: 150, sortValue: (row) => row.availabilityZone, cell: (row) => row.availabilityZone },
    { key: "rtb", header: "Route table", minWidth: 190, sortValue: (row) => row.routeTableId, cell: (row) => <CopyText value={row.routeTableId} /> },
  ];

  const openCreate = () => {
    setForm({ name: "", vpcId: api.vpcs[0]?.id ?? "", ipv4Cidr: "", availabilityZone: zones[0] ?? "" });
    setError(null);
    setCreateOpen(true);
  };

  return (
    <NetworkList
      title="Subnets"
      info="A subnet is a range of IP addresses in your VPC, placed in one Availability Zone."
      rows={api.subnets}
      getId={(row) => row.id}
      columns={columns}
      vpcOf={(row) => row.vpcId}
      actions={[{ label: "Delete subnet", onSelect: (rows) => api.deleteSubnets(rows.map((row) => row.id)) }]}
      createLabel="Create subnet"
      onCreate={openCreate}
      emptyTitle="No subnets found"
      emptyMessage="You do not have any subnets in this region"
      filterPlaceholder="Find subnets by attribute or tag"
      detailTitle={(row) => `${row.id}${row.name ? ` / ${row.name}` : ""}`}
      detailTabs={[{ id: "details", label: "Details" }, { id: "rtb", label: "Route table" }]}
      renderDetail={(row, tab) => {
        if (tab === "rtb") {
          const table = api.routeTables.find((item) => item.id === row.routeTableId);
          return table ? (
            <div className="space-y-2 text-[13px]">
              <p>
                Associated with <span className="font-semibold">{table.id}</span> {table.main ? "(main)" : ""}
              </p>
              <ul className="list-disc pl-5">
                {table.routes.map((route) => (
                  <li key={route.destination}>
                    {route.destination} → {route.target}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[13px] text-[#5f6b7a]">No route table is associated with this subnet.</p>
          );
        }
        return (
          <DetailGrid
            items={[
              ["Subnet ID", row.id],
              ["State", row.state === "available" ? "Available" : "Pending"],
              ["VPC", row.vpcId],
              ["IPv4 CIDR", row.ipv4Cidr],
              ["Available IPv4 addresses", String(row.availableIps)],
              ["Availability Zone", row.availabilityZone],
              ["Route table", dash(row.routeTableId)],
              ["Auto-assign public IPv4 address", row.autoAssignPublicIp ? "Yes" : "No"],
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
            <OrangeButton
              onClick={() => {
                const result = api.createSubnet(form);
                if (result) setError(result);
                else setCreateOpen(false);
              }}
            >
              Create subnet
            </OrangeButton>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <FieldLabel>VPC ID</FieldLabel>
            <select className="field" value={form.vpcId} onChange={(event) => setForm({ ...form, vpcId: event.target.value })}>
              {api.vpcs.map((vpc) => (
                <option key={vpc.id} value={vpc.id}>
                  {vpc.id} ({vpc.ipv4Cidr})
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Subnet name</FieldLabel>
            <input className="field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>
          <div>
            <FieldLabel>Availability Zone</FieldLabel>
            <select className="field" value={form.availabilityZone} onChange={(event) => setForm({ ...form, availabilityZone: event.target.value })}>
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>IPv4 subnet CIDR block</FieldLabel>
            <input className="field" placeholder="10.0.1.0/24" value={form.ipv4Cidr} onChange={(event) => setForm({ ...form, ipv4Cidr: event.target.value })} />
          </div>
          {error ? <p role="alert" className="text-[13px] text-[#d91515]">{error}</p> : null}
        </div>
      </PanelDialog>
    </NetworkList>
  );
}
