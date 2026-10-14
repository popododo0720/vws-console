"use client";

import { useState } from "react";
import type { ElasticIp, Instance } from "@/types/console";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { allocateAddressAction, associateAddressAction, disassociateAddressesAction, releaseAddressesAction } from "@/app/actions/resources";
import type { ApiError } from "@/lib/vws-api/adapter";
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

type Dialog = { kind: "allocate" } | { kind: "associate"; eip: ElasticIp } | null;

export function ElasticIpsView({
  addresses,
  instances,
  loadError,
}: {
  addresses: ElasticIp[];
  instances: Instance[];
  loadError: ApiError | null;
}) {
  const action = useApiAction();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [instanceId, setInstanceId] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Terminated instances cannot take an address.
  const associable = instances.filter((item) => item.state !== "terminated" && item.state !== "shutting-down");

  const columns: Column<ElasticIp>[] = [
    { key: "name", header: "Name", minWidth: 150, sortValue: (row) => row.name, cell: (row) => dash(row.name) },
    { key: "address", header: "Allocated IPv4 address", minWidth: 170, sortValue: (row) => row.address, cell: (row) => row.address },
    { key: "type", header: "Type", minWidth: 100, sortValue: () => "Public IP", cell: () => "Public IP" },
    { key: "alloc", header: "Allocation ID", minWidth: 210, sortValue: (row) => row.allocationId, cell: (row) => <CopyText value={row.allocationId} /> },
    { key: "instance", header: "Associated instance ID", minWidth: 200, sortValue: (row) => row.instanceId, cell: (row) => (row.instanceId ? <CopyText value={row.instanceId} /> : "—") },
    { key: "private", header: "Private IP address", minWidth: 150, sortValue: (row) => row.privateIp, cell: (row) => dash(row.privateIp) },
  ];

  const open = (next: Dialog) => {
    setError(null);
    setInstanceId(associable[0]?.id ?? "");
    setDialog(next);
  };
  const close = () => setDialog(null);

  return (
    <NetworkList
      title="Elastic IP addresses"
      info="An Elastic IP address is a static public IPv4 address you can move between instances."
      rows={addresses}
      getId={(row) => row.allocationId}
      live={{
        vpcs: [],
        onRefresh: action.refresh,
        banner: (
          <>
            <ApiErrorAlert error={loadError} title="Elastic IP addresses could not be loaded" />
            <ApiErrorAlert error={action.error} title="The Elastic IP address action failed" />
          </>
        ),
      }}
      columns={columns}
      actions={[
        {
          label: "Associate Elastic IP address",
          disabled: (rows) => action.pending || rows.length !== 1 || Boolean(rows[0].instanceId),
          onSelect: (rows) => open({ kind: "associate", eip: rows[0] }),
        },
        {
          label: "Disassociate Elastic IP address",
          disabled: (rows) => action.pending || rows.length !== 1 || !rows[0].instanceId,
          onSelect: (rows) => action.run(() => disassociateAddressesAction([rows[0].allocationId])),
        },
        {
          label: "Release Elastic IP addresses",
          disabled: (rows) => action.pending || rows.length === 0 || rows.some((row) => row.instanceId),
          onSelect: (rows) => action.run(() => releaseAddressesAction(rows.map((row) => row.allocationId))),
        },
      ]}
      createLabel="Allocate Elastic IP address"
      onCreate={() => open({ kind: "allocate" })}
      emptyTitle="No Elastic IP addresses found"
      emptyMessage="You do not have any Elastic IP addresses in this region"
      filterPlaceholder="Filter Elastic IP addresses"
      detailTitle={(row) => row.address}
      renderDetail={(row) => (
        <DetailGrid
          items={[
            ["Allocated IPv4 address", row.address],
            ["Allocation ID", row.allocationId],
            ["Associated instance ID", dash(row.instanceId)],
            ["Private IP address", dash(row.privateIp)],
            ["Network border group", "—"],
            ["Owner", dash(row.owner)],
          ]}
        />
      )}
    >
      <PanelDialog
        open={dialog?.kind === "allocate"}
        title="Allocate Elastic IP address"
        onClose={close}
        footer={
          <>
            <OutlineButton onClick={close}>Cancel</OutlineButton>
            <OrangeButton disabled={action.pending} onClick={() => action.run(allocateAddressAction, close)}>
              Allocate
            </OrangeButton>
          </>
        }
      >
        <FieldLabel>Name tag</FieldLabel>
        <p>—</p>
        <p className="mt-2 text-[12px] text-[#5f6b7a]">The VWS API does not take a name tag for an address yet.</p>
      </PanelDialog>
      <PanelDialog
        open={dialog?.kind === "associate"}
        title="Associate Elastic IP address"
        onClose={close}
        footer={
          <>
            <OutlineButton onClick={close}>Cancel</OutlineButton>
            <OrangeButton
              disabled={action.pending}
              onClick={() => {
                if (dialog?.kind !== "associate") return;
                if (!instanceId) return setError("Choose an instance.");
                const allocationId = dialog.eip.allocationId;
                action.run(() => associateAddressAction(allocationId, instanceId), close);
              }}
            >
              Associate
            </OrangeButton>
          </>
        }
      >
        {associable.length === 0 ? (
          <p>There are no instances in this region.</p>
        ) : (
          <div className="space-y-3">
            <FieldLabel>Instance</FieldLabel>
            <select className="field" value={instanceId} onChange={(event) => setInstanceId(event.target.value)}>
              {associable.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name ? `${item.name} (${item.id})` : item.id}
                </option>
              ))}
            </select>
            {error ? <p role="alert" className="text-[13px] text-[#d91515]">{error}</p> : null}
          </div>
        )}
      </PanelDialog>
    </NetworkList>
  );
}
