"use client";

import { useState } from "react";
import type { NatGateway } from "@/types/console";
import { formatEc2Time } from "@/lib/ebs";
import { useConsole } from "@/components/sites/console/console-provider";
import { NetworkList } from "@/components/sites/console/network-list";
import { SuccessBadge } from "@/components/sites/console/network-cells";
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

type Dialog = { kind: "create" } | { kind: "delete"; gateway: NatGateway } | null;

const CONFIRM_WORD = "delete";

const stateLabel = (state: NatGateway["state"]) => state.charAt(0).toUpperCase() + state.slice(1);
const connectivityLabel = (value: NatGateway["connectivity"]) => (value === "public" ? "Public" : "Private");
const idCell = (value: string) => (value ? <CopyText value={value} /> : "—");
const timeOf = (iso: string) => (iso ? formatEc2Time(iso) : "—");

export function NatGatewaysView() {
  const api = useConsole();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [name, setName] = useState("");
  const [subnetId, setSubnetId] = useState("");
  const [connectivity, setConnectivity] = useState<NatGateway["connectivity"]>("public");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const columns: Column<NatGateway>[] = [
    { key: "name", header: "Name", minWidth: 150, sortValue: (row) => row.name, cell: (row) => dash(row.name) },
    {
      key: "id",
      header: "NAT gateway ID",
      minWidth: 200,
      sortValue: (row) => row.id,
      cell: (row) => <CopyText value={row.id} />,
    },
    {
      key: "connectivity",
      header: "Connectivity type",
      minWidth: 160,
      sortValue: (row) => connectivityLabel(row.connectivity),
      cell: (row) => connectivityLabel(row.connectivity),
    },
    {
      key: "state",
      header: "State",
      minWidth: 120,
      sortValue: (row) => row.state,
      cell: (row) => (row.state === "available" ? <SuccessBadge>Available</SuccessBadge> : stateLabel(row.state)),
    },
    {
      key: "message",
      header: "State message",
      minWidth: 150,
      sortValue: (row) => row.stateMessage,
      cell: (row) => dash(row.stateMessage),
    },
    {
      key: "mode",
      header: "Availability mode",
      minWidth: 160,
      sortValue: (row) => row.availabilityMode,
      cell: () => "Zonal",
    },
    {
      key: "rtb",
      header: "Route table ID",
      minWidth: 190,
      sortValue: (row) => row.routeTableId,
      cell: (row) => idCell(row.routeTableId),
    },
    {
      key: "public",
      header: "Primary public IPv4 address",
      minWidth: 220,
      sortValue: (row) => row.publicIp,
      cell: (row) => dash(row.publicIp),
    },
    {
      key: "private",
      header: "Primary private IPv4 address",
      minWidth: 220,
      sortValue: (row) => row.privateIp,
      cell: (row) => dash(row.privateIp),
    },
    {
      key: "eni",
      header: "Primary network interface ID",
      minWidth: 230,
      sortValue: (row) => row.networkInterfaceId,
      cell: (row) => idCell(row.networkInterfaceId),
    },
    {
      key: "vpc",
      header: "VPC",
      minWidth: 190,
      sortValue: (row) => row.vpcId,
      cell: (row) => idCell(row.vpcId),
    },
    {
      key: "subnet",
      header: "Subnet",
      minWidth: 190,
      sortValue: (row) => row.subnetId,
      cell: (row) => idCell(row.subnetId),
    },
    {
      key: "created",
      header: "Created",
      minWidth: 200,
      sortValue: (row) => row.created,
      cell: (row) => timeOf(row.created),
    },
    {
      key: "deleted",
      header: "Deleted",
      minWidth: 200,
      sortValue: (row) => row.deleted,
      cell: (row) => timeOf(row.deleted),
    },
  ];

  const openCreate = () => {
    setName("");
    setSubnetId("");
    setConnectivity("public");
    setError(null);
    setDialog({ kind: "create" });
  };
  const openDelete = (gateway: NatGateway) => {
    setConfirm("");
    setDialog({ kind: "delete", gateway });
  };
  const close = () => setDialog(null);

  return (
    <NetworkList
      title="NAT gateways"
      info="A NAT gateway lets instances in a private subnet reach other networks without accepting inbound connections."
      rows={api.natGateways}
      getId={(row) => row.id}
      columns={columns}
      vpcOf={(row) => row.vpcId}
      actions={[
        { label: "Manage tags", disabled: () => true, onSelect: () => undefined },
        {
          label: "Delete NAT gateway",
          disabled: (rows) => rows.length !== 1 || rows[0].state !== "available",
          onSelect: (rows) => openDelete(rows[0]),
        },
      ]}
      createLabel="Create NAT gateway"
      onCreate={openCreate}
      emptyLine="No NAT gateways found"
      filterPlaceholder="Find NAT gateways by attribute or tag"
      selectTitle="Select a NAT gateway"
      detailTitle={(row) => `${row.id}${row.name ? ` / ${row.name}` : ""}`}
      renderDetail={(row) => (
        <DetailGrid
          items={[
            ["NAT gateway ID", row.id],
            ["Connectivity type", connectivityLabel(row.connectivity)],
            ["State", stateLabel(row.state)],
            ["State message", dash(row.stateMessage)],
            ["Availability mode", "Zonal"],
            ["Route table ID", dash(row.routeTableId)],
            ["Primary public IPv4 address", dash(row.publicIp)],
            ["Primary private IPv4 address", dash(row.privateIp)],
            ["Primary network interface ID", dash(row.networkInterfaceId)],
            ["VPC", dash(row.vpcId)],
            ["Subnet", dash(row.subnetId)],
            ["Created", timeOf(row.created)],
            ["Deleted", timeOf(row.deleted)],
          ]}
        />
      )}
    >
      <PanelDialog
        open={dialog?.kind === "create"}
        title="Create NAT gateway"
        onClose={close}
        footer={
          <>
            <OutlineButton onClick={close}>Cancel</OutlineButton>
            <OrangeButton
              onClick={() => {
                const failure = api.createNatGateway({ name, subnetId, connectivity });
                setError(failure);
                if (!failure) close();
              }}
            >
              Create NAT gateway
            </OrangeButton>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <FieldLabel>Name - optional</FieldLabel>
            <input className="field" aria-label="Name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div>
            <FieldLabel>Subnet</FieldLabel>
            <select
              className="field"
              aria-label="Subnet"
              value={subnetId}
              onChange={(event) => setSubnetId(event.target.value)}
            >
              <option value="">Select a subnet</option>
              {api.subnets.map((subnet) => (
                <option key={subnet.id} value={subnet.id}>
                  {subnet.id} ({subnet.ipv4Cidr})
                </option>
              ))}
            </select>
          </div>
          <fieldset>
            <legend className="mb-1 text-[13px] font-semibold">Connectivity type</legend>
            {(["public", "private"] as const).map((value) => (
              <label key={value} className="mr-4 inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="connectivity"
                  checked={connectivity === value}
                  onChange={() => setConnectivity(value)}
                />
                {connectivityLabel(value)}
              </label>
            ))}
          </fieldset>
          {error ? (
            <p role="alert" className="text-[13px] text-[#d91515]">
              {error}
            </p>
          ) : null}
        </div>
      </PanelDialog>
      <PanelDialog
        open={dialog?.kind === "delete"}
        title="Delete NAT gateway"
        onClose={close}
        footer={
          <>
            <OutlineButton onClick={close}>Cancel</OutlineButton>
            <OrangeButton
              disabled={confirm !== CONFIRM_WORD}
              onClick={() => {
                if (dialog?.kind !== "delete") return;
                api.deleteNatGateways([dialog.gateway.id]);
                close();
              }}
            >
              Delete
            </OrangeButton>
          </>
        }
      >
        <div className="space-y-3">
          <p>Are you sure you want to delete {dialog?.kind === "delete" ? dialog.gateway.id : "this NAT gateway"}?</p>
          <div>
            <FieldLabel>To confirm deletion, type {CONFIRM_WORD} in the field.</FieldLabel>
            <input
              className="field"
              aria-label="Confirm deletion"
              placeholder={CONFIRM_WORD}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </div>
        </div>
      </PanelDialog>
    </NetworkList>
  );
}
