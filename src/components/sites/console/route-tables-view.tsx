"use client";

import { useState } from "react";
import type { RouteTable } from "@/types/console";
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

type Dialog =
  | { kind: "create" }
  | { kind: "route"; table: RouteTable }
  | { kind: "associate"; table: RouteTable }
  | null;

export function RouteTablesView() {
  const api = useConsole();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [vpcId, setVpcId] = useState("");
  const [destination, setDestination] = useState("0.0.0.0/0");
  const [target, setTarget] = useState("");
  const [subnetId, setSubnetId] = useState("");

  const columns: Column<RouteTable>[] = [
    { key: "name", header: "Name", minWidth: 150, sortValue: (row) => row.name, cell: (row) => dash(row.name) },
    { key: "id", header: "Route table ID", minWidth: 190, sortValue: (row) => row.id, cell: (row) => <CopyText value={row.id} /> },
    { key: "assoc", header: "Explicit subnet associations", minWidth: 200, sortValue: (row) => String(row.subnetIds.length), cell: (row) => (row.subnetIds.length ? `${row.subnetIds.length} subnet${row.subnetIds.length === 1 ? "" : "s"}` : "—") },
    { key: "main", header: "Main", minWidth: 80, sortValue: (row) => String(row.main), cell: (row) => (row.main ? "Yes" : "No") },
    { key: "vpc", header: "VPC", minWidth: 190, sortValue: (row) => row.vpcId, cell: (row) => <CopyText value={row.vpcId} /> },
    { key: "routes", header: "Routes", minWidth: 90, sortValue: (row) => String(row.routes.length), cell: (row) => String(row.routes.length) },
  ];

  const open = (next: Dialog) => {
    setError(null);
    setName("");
    setVpcId(api.vpcs[0]?.id ?? "");
    setDestination("0.0.0.0/0");
    setTarget("");
    setSubnetId("");
    setDialog(next);
  };
  const close = () => setDialog(null);
  const targetsFor = (table: RouteTable) =>
    api.internetGateways.filter((item) => item.state === "attached" && item.vpcId === table.vpcId).map((item) => item.id);
  const freeSubnets = (table: RouteTable) => api.subnets.filter((item) => item.vpcId === table.vpcId && item.routeTableId !== table.id);

  return (
    <NetworkList
      title="Route tables"
      info="A route table decides where network traffic from your subnets is sent."
      rows={api.routeTables}
      getId={(row) => row.id}
      columns={columns}
      vpcOf={(row) => row.vpcId}
      actions={[
        {
          label: "Edit routes",
          disabled: (rows) => rows.length !== 1,
          onSelect: (rows) => open({ kind: "route", table: rows[0] }),
        },
        {
          label: "Edit subnet associations",
          disabled: (rows) => rows.length !== 1,
          onSelect: (rows) => open({ kind: "associate", table: rows[0] }),
        },
        {
          label: "Delete route table",
          disabled: (rows) => rows.length === 0 || rows.some((row) => row.main),
          onSelect: (rows) => api.deleteRouteTables(rows.map((row) => row.id)),
        },
      ]}
      createLabel="Create route table"
      onCreate={() => open({ kind: "create" })}
      emptyTitle="No route tables found"
      emptyMessage="You do not have any route tables in this region"
      filterPlaceholder="Filter route tables"
      detailTitle={(row) => `${row.id}${row.name ? ` / ${row.name}` : ""}`}
      detailTabs={[
        { id: "details", label: "Details" },
        { id: "routes", label: "Routes" },
        { id: "subnets", label: "Subnet associations" },
      ]}
      renderDetail={(row, tab) => {
        if (tab === "routes") {
          return (
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="text-[#5f6b7a]">
                  <th className="py-1 pr-4">Destination</th>
                  <th className="py-1 pr-4">Target</th>
                  <th className="py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {row.routes.map((route) => (
                  <tr key={route.destination} className="border-t border-[#e6e8eb]">
                    <td className="py-1 pr-4">{route.destination}</td>
                    <td className="py-1 pr-4">{route.target}</td>
                    <td className="py-1">{route.status === "active" ? "Active" : "Blackhole"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }
        if (tab === "subnets") {
          return row.subnetIds.length ? (
            <ul className="list-disc pl-5 text-[13px]">
              {row.subnetIds.map((id) => (
                <li key={id}>{id}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-[#5f6b7a]">No explicit subnet associations.</p>
          );
        }
        return (
          <DetailGrid
            items={[
              ["Route table ID", row.id],
              ["Main", row.main ? "Yes" : "No"],
              ["VPC", row.vpcId],
              ["Explicit subnet associations", row.subnetIds.length ? row.subnetIds.join(", ") : "—"],
              ["Routes", String(row.routes.length)],
            ]}
          />
        );
      }}
    >
      <PanelDialog
        open={dialog?.kind === "create"}
        title="Create route table"
        onClose={close}
        footer={
          <>
            <OutlineButton onClick={close}>Cancel</OutlineButton>
            <OrangeButton
              onClick={() => {
                if (!vpcId) return setError("Choose a VPC.");
                api.createRouteTable({ name, vpcId });
                close();
              }}
            >
              Create route table
            </OrangeButton>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <FieldLabel>Name</FieldLabel>
            <input className="field" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div>
            <FieldLabel>VPC</FieldLabel>
            <select className="field" value={vpcId} onChange={(event) => setVpcId(event.target.value)}>
              {api.vpcs.map((vpc) => (
                <option key={vpc.id} value={vpc.id}>
                  {vpc.id}
                </option>
              ))}
            </select>
          </div>
          {error ? <p role="alert" className="text-[13px] text-[#d91515]">{error}</p> : null}
        </div>
      </PanelDialog>
      <PanelDialog
        open={dialog?.kind === "route"}
        title="Edit routes"
        onClose={close}
        footer={
          <>
            <OutlineButton onClick={close}>Close</OutlineButton>
            <OrangeButton
              onClick={() => {
                if (dialog?.kind !== "route") return;
                const result = api.addRoute(dialog.table.id, destination, target);
                setError(result);
                if (!result) close();
              }}
            >
              Add route
            </OrangeButton>
          </>
        }
      >
        {dialog?.kind === "route" ? (
          <div className="space-y-3">
            <div>
              <FieldLabel>Destination</FieldLabel>
              <input className="field" value={destination} onChange={(event) => setDestination(event.target.value)} />
            </div>
            <div>
              <FieldLabel>Target</FieldLabel>
              <select className="field" value={target} onChange={(event) => setTarget(event.target.value)}>
                <option value="">Choose a target</option>
                {targetsFor(dialog.table).map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
              {targetsFor(dialog.table).length === 0 ? (
                <p className="mt-1 text-[12px] text-[#5f6b7a]">Attach an internet gateway to this VPC to route to it.</p>
              ) : null}
            </div>
            {error ? <p role="alert" className="text-[13px] text-[#d91515]">{error}</p> : null}
          </div>
        ) : null}
      </PanelDialog>
      <PanelDialog
        open={dialog?.kind === "associate"}
        title="Edit subnet associations"
        onClose={close}
        footer={
          <>
            <OutlineButton onClick={close}>Cancel</OutlineButton>
            <OrangeButton
              onClick={() => {
                if (dialog?.kind !== "associate" || !subnetId) return setError("Choose a subnet.");
                api.associateSubnet(dialog.table.id, subnetId);
                close();
              }}
            >
              Save associations
            </OrangeButton>
          </>
        }
      >
        {dialog?.kind === "associate" ? (
          freeSubnets(dialog.table).length === 0 ? (
            <p>There are no other subnets in this VPC to associate.</p>
          ) : (
            <div className="space-y-3">
              <FieldLabel>Subnet to associate</FieldLabel>
              <select className="field" value={subnetId} onChange={(event) => setSubnetId(event.target.value)}>
                <option value="">Choose a subnet</option>
                {freeSubnets(dialog.table).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id} ({item.ipv4Cidr})
                  </option>
                ))}
              </select>
              {error ? <p role="alert" className="text-[13px] text-[#d91515]">{error}</p> : null}
            </div>
          )
        ) : null}
      </PanelDialog>
    </NetworkList>
  );
}
