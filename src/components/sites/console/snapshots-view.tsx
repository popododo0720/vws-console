"use client";

import { useState } from "react";
import type { Snapshot, Volume } from "@/types/console";
import { computeNav } from "@/lib/console-data";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { createSnapshotAction, deleteSnapshotsAction } from "@/app/actions/resources";
import type { ApiError } from "@/lib/vws-api/adapter";
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
  dash,
  menuTriggerClass,
} from "@/components/sites/console/ui";

function snapshotState(row: Snapshot) {
  return row.state ? row.state.charAt(0).toUpperCase() + row.state.slice(1) : "—";
}

export function SnapshotsView({ snapshots, volumes, loadError }: { snapshots: Snapshot[]; volumes: Volume[]; loadError: ApiError | null }) {
  const action = useApiAction();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dock, setDock] = useState(240);
  const [updated, setUpdated] = useState("Last updated less than a minute ago");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ volumeId: "", description: "" });
  const selected = snapshots.filter((item) => selectedIds.includes(item.id));
  const one = selected.length === 1 ? selected[0] : null;

  const columns: Column<Snapshot>[] = [
    { key: "name", header: "Name", minWidth: 140, sortValue: (row) => row.name, cell: (row) => <NameCell value={row.name} /> },
    { key: "id", header: "Snapshot ID", minWidth: 150, sortValue: (row) => row.id, cell: (row) => <CopyText value={row.id} /> },
    { key: "size", header: "Full snapshot size", minWidth: 140, sortValue: (row) => String(row.sizeGiB), cell: (row) => `${row.sizeGiB} GiB` },
    { key: "volume", header: "Volume ID", minWidth: 180, sortValue: (row) => row.volumeId, cell: (row) => <CopyText value={row.volumeId} /> },
    { key: "state", header: "Snapshot status", minWidth: 120, sortValue: (row) => row.state, cell: (row) => snapshotState(row) },
    { key: "started", header: "Started", minWidth: 120, sortValue: (row) => row.started, cell: (row) => dash(row.started) },
    { key: "desc", header: "Description", minWidth: 160, sortValue: (row) => row.description, cell: (row) => dash(row.description) },
    { key: "owner", header: "Owner", minWidth: 140, sortValue: (row) => row.owner, cell: (row) => dash(row.owner) },
  ];

  return (
    <Shell tree={computeNav}>
      <PageHeader
        mark="C"
        crumbs={[{ label: "EC2", href: "/compute/instances" }, { label: "Snapshots" }]}
        info="Snapshots are point-in-time backups of volumes in the current region."
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
                {
                  label: "Delete snapshot",
                  disabled: action.pending || selected.length === 0,
                  onSelect: () => action.run(() => deleteSnapshotsAction(selected.map((item) => item.id)), () => setSelectedIds([])),
                },
              ]}
            />
            <OrangeButton
              onClick={() => {
                setForm({ volumeId: volumes[0]?.id ?? "", description: "" });
                setCreateOpen(true);
              }}
            >
              Create snapshot
            </OrangeButton>
          </>
        }
      />
      <ApiErrorAlert error={loadError} title="Snapshots could not be loaded" />
      <ApiErrorAlert error={action.error} title="The snapshot action failed" />
      <ResourceTable
        rows={snapshots}
        getId={(row) => row.id}
        columns={columns}
        selectedIds={selected.map((item) => item.id)}
        onSelectedIds={setSelectedIds}
        emptyTitle="No snapshots"
        emptyMessage="You currently have no snapshots in this region"
        filterPlaceholder="Search"
        onRefresh={() => {
          setUpdated("Last updated less than a minute ago");
          action.refresh();
        }}
      />
      <DetailDock title={one ? `Snapshot ID: ${one.id}` : "Select a snapshot"} height={dock} onHeight={setDock}>
        {one ? (
          <dl className="grid gap-x-8 gap-y-3 text-[13px] sm:grid-cols-3">
            {[
              ["Snapshot ID", one.id],
              ["Volume ID", one.volumeId],
              ["Full snapshot size", `${one.sizeGiB} GiB`],
              ["Snapshot status", snapshotState(one)],
              ["Started", dash(one.started)],
              ["Description", dash(one.description)],
              ["Owner", dash(one.owner)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="font-semibold text-[#5f6b7a]">{k}</dt>
                <dd className="break-all">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-[13px] text-[#5f6b7a]">Select a snapshot above to see its details.</p>
        )}
      </DetailDock>
      <PanelDialog
        open={createOpen}
        title="Create snapshot"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <OutlineButton onClick={() => setCreateOpen(false)}>Cancel</OutlineButton>
            <OrangeButton
              disabled={action.pending || !form.volumeId}
              onClick={() => action.run(() => createSnapshotAction(form.volumeId, form.description), () => setCreateOpen(false))}
            >
              Create snapshot
            </OrangeButton>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <FieldLabel>Volume ID</FieldLabel>
            {volumes.length === 0 ? (
              <p className="text-[13px] text-[#5f6b7a]">There are no volumes in this region.</p>
            ) : (
              <select className="field" value={form.volumeId} onChange={(event) => setForm({ ...form, volumeId: event.target.value })}>
                {volumes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <FieldLabel>Name</FieldLabel>
            <p>—</p>
            <p className="mt-1 text-[12px] text-[#5f6b7a]">The VWS API does not take a snapshot name yet.</p>
          </div>
          <div>
            <FieldLabel>Description</FieldLabel>
            <input className="field" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </div>
        </div>
      </PanelDialog>
    </Shell>
  );
}
