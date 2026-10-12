"use client";

import { useState } from "react";
import type { InternetGateway } from "@/types/console";
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

type Dialog = { kind: "create" } | { kind: "attach"; gateway: InternetGateway } | null;

export function GatewaysView() {
  const api = useConsole();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [name, setName] = useState("");
  const [vpcId, setVpcId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const columns: Column<InternetGateway>[] = [
    { key: "name", header: "Name", minWidth: 150, sortValue: (row) => row.name, cell: (row) => dash(row.name) },
    { key: "id", header: "Internet gateway ID", minWidth: 200, sortValue: (row) => row.id, cell: (row) => <CopyText value={row.id} /> },
    { key: "state", header: "State", minWidth: 110, sortValue: (row) => row.state, cell: (row) => (row.state === "attached" ? "Attached" : "Detached") },
    { key: "vpc", header: "VPC ID", minWidth: 190, sortValue: (row) => row.vpcId, cell: (row) => <CopyText value={row.vpcId} /> },
    { key: "owner", header: "Owner", minWidth: 130, sortValue: () => api.account.id, cell: () => api.account.id },
  ];

  const open = (next: Dialog) => {
    setName("");
    setError(null);
    const used = new Set(api.internetGateways.map((item) => item.vpcId));
    setVpcId(api.vpcs.find((item) => !used.has(item.id))?.id ?? "");
    setDialog(next);
  };
  const close = () => setDialog(null);

  return (
    <NetworkList
      title="Internet gateways"
      info="An internet gateway connects a VPC to the internet. Each VPC can have one attached."
      rows={api.internetGateways}
      getId={(row) => row.id}
      columns={columns}
      vpcOf={(row) => row.vpcId}
      actions={[
        {
          label: "Attach to VPC",
          disabled: (rows) => rows.length !== 1 || rows[0].state === "attached",
          onSelect: (rows) => open({ kind: "attach", gateway: rows[0] }),
        },
        {
          label: "Detach from VPC",
          disabled: (rows) => rows.length !== 1 || rows[0].state !== "attached",
          onSelect: (rows) => api.detachInternetGateway(rows[0].id),
        },
        {
          label: "Delete internet gateway",
          disabled: (rows) => rows.length === 0 || rows.some((row) => row.state === "attached"),
          onSelect: (rows) => api.deleteInternetGateways(rows.map((row) => row.id)),
        },
      ]}
      createLabel="Create internet gateway"
      onCreate={() => open({ kind: "create" })}
      emptyTitle="No internet gateways found"
      emptyMessage="You do not have any internet gateways in this region"
      filterPlaceholder="Filter internet gateways"
      detailTitle={(row) => `${row.id}${row.name ? ` / ${row.name}` : ""}`}
      renderDetail={(row) => (
        <DetailGrid
          items={[
            ["Internet gateway ID", row.id],
            ["State", row.state === "attached" ? "Attached" : "Detached"],
            ["VPC ID", dash(row.vpcId)],
            ["Owner", api.account.id],
          ]}
        />
      )}
    >
      <PanelDialog
        open={dialog?.kind === "create"}
        title="Create internet gateway"
        onClose={close}
        footer={
          <>
            <OutlineButton onClick={close}>Cancel</OutlineButton>
            <OrangeButton
              onClick={() => {
                api.createInternetGateway(name);
                close();
              }}
            >
              Create internet gateway
            </OrangeButton>
          </>
        }
      >
        <FieldLabel>Name tag</FieldLabel>
        <input className="field" value={name} onChange={(event) => setName(event.target.value)} />
      </PanelDialog>
      <PanelDialog
        open={dialog?.kind === "attach"}
        title="Attach to VPC"
        onClose={close}
        footer={
          <>
            <OutlineButton onClick={close}>Cancel</OutlineButton>
            <OrangeButton
              onClick={() => {
                if (dialog?.kind !== "attach") return;
                if (!vpcId) return setError("Choose a VPC without an internet gateway.");
                const result = api.attachInternetGateway(dialog.gateway.id, vpcId);
                setError(result);
                if (!result) close();
              }}
            >
              Attach internet gateway
            </OrangeButton>
          </>
        }
      >
        <div className="space-y-3">
          <FieldLabel>Available VPCs</FieldLabel>
          <select className="field" value={vpcId} onChange={(event) => setVpcId(event.target.value)}>
            <option value="">Select a VPC</option>
            {api.vpcs.map((vpc) => (
              <option key={vpc.id} value={vpc.id}>
                {vpc.id}
              </option>
            ))}
          </select>
          {error ? <p role="alert" className="text-[13px] text-[#d91515]">{error}</p> : null}
        </div>
      </PanelDialog>
    </NetworkList>
  );
}
