"use client";

import { DetailLink } from "@/components/sites/console/resource-detail";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Volume } from "@/types/console";
import { computeNav } from "@/lib/console-data";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { createSnapshotAction, createVolumeAction, deleteVolumesAction } from "@/app/actions/resources";
import type { ApiError } from "@/lib/vws-api/adapter";
import { DetailDock } from "@/components/sites/console/detail-dock";
import { PageHeader } from "@/components/sites/console/page-header";
import { Column, NameCell, ResourceTable } from "@/components/sites/console/resource-table";
import { Shell } from "@/components/sites/console/shell";
import {
  FieldLabel,
  InfoTip,
  MenuButton,
  MenuChevron,
  OrangeButton,
  OutlineButton,
  PanelDialog,
  dash,
  menuTriggerClass,
} from "@/components/sites/console/ui";

const VOLUME_TYPES = ["gp3", "gp2", "standard"];

function volumeState(row: Volume) {
  return row.state ? row.state.charAt(0).toUpperCase() + row.state.slice(1) : "—";
}

export function VolumesView({ volumes, loadError }: { volumes: Volume[]; loadError: ApiError | null }) {
  const action = useApiAction();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dock, setDock] = useState(240);
  const [updated, setUpdated] = useState("less than a minute ago");
  const [createOpen, setCreateOpen] = useState(false);
  const [recycleOpen, setRecycleOpen] = useState(false);
  const [snapOpen, setSnapOpen] = useState(false);
  const [snapDescription, setSnapDescription] = useState("");
  const [form, setForm] = useState({ volumeType: VOLUME_TYPES[0], sizeGiB: 8 });
  const selected = volumes.filter((item) => selectedIds.includes(item.id));
  const one = selected.length === 1 ? selected[0] : null;
  const backedUp = volumes.filter((item) => item.snapshotId).length;
  const refresh = () => {
    setUpdated("less than a minute ago");
    action.refresh();
  };

  const columns: Column<Volume>[] = [
    { key: "name", header: "Name", minWidth: 140, sortValue: (row) => row.name, cell: (row) => <NameCell value={row.name} /> },
    { key: "id", header: "Volume ID", minWidth: 180, sortValue: (row) => row.id, cell: (row) => <DetailLink href={`/storage/volumes/${row.id}`} id={row.id} /> },
    { key: "state", header: "Volume state", minWidth: 120, sortValue: (row) => volumeState(row), cell: (row) => volumeState(row) },
    { key: "type", header: "Type", minWidth: 130, sortValue: (row) => row.volumeType, cell: (row) => row.volumeType },
    { key: "size", header: "Size", minWidth: 80, sortValue: (row) => String(row.sizeGiB), cell: (row) => `${row.sizeGiB} GiB` },
    { key: "iops", header: "IOPS", minWidth: 80, sortValue: (row) => String(row.iops ?? ""), cell: (row) => (row.iops === null ? "—" : row.iops) },
    { key: "throughput", header: "Throughput", minWidth: 110, sortValue: (row) => row.throughput, cell: (row) => dash(row.throughput) },
    { key: "owner", header: "Owner ID", minWidth: 140, sortValue: (row) => row.owner, cell: (row) => dash(row.owner) },
    { key: "snapshot", header: "Snapshot ID", minWidth: 120, sortValue: (row) => row.snapshotId, cell: (row) => dash(row.snapshotId) },
    { key: "source", header: "Source volume ID", minWidth: 150, sortValue: (row) => row.sourceVolumeId, cell: (row) => dash(row.sourceVolumeId) },
    { key: "created", header: "Created", minWidth: 120, sortValue: (row) => row.created, cell: (row) => dash(row.created) },
    { key: "az", header: "Availability", minWidth: 120, sortValue: (row) => row.availabilityZone, cell: (row) => row.availabilityZone },
  ];

  return (
    <Shell tree={computeNav}>
      <PageHeader
        mark="C"
        crumbs={[{ label: "EC2", href: "/compute/instances" }, { label: "Volumes" }]}
        info="Volumes are block disks in the current region, read from the VWS API."
        actions={
          <>
            <span className="text-right text-[12px] leading-4 text-[#5f6b7a]">
              Last updated
              <br />
              {updated}
            </span>
            <RefreshButton onClick={refresh} />
            <OutlineButton onClick={() => setRecycleOpen(true)}>Recycle bin</OutlineButton>
            <MenuButton
              className={menuTriggerClass()}
              label={
                <>
                  Actions <MenuChevron />
                </>
              }
              items={[
                {
                  label: "Create snapshot",
                  disabled: !one,
                  onSelect: () => {
                    setSnapDescription("");
                    setSnapOpen(true);
                  },
                },
                {
                  label: "Delete volume",
                  disabled: action.pending || selected.length === 0,
                  onSelect: () => action.run(() => deleteVolumesAction(selected.map((item) => item.id)), () => setSelectedIds([])),
                },
              ]}
            />
            <OrangeButton onClick={() => setCreateOpen(true)}>Create volume</OrangeButton>
          </>
        }
      />
      <ApiErrorAlert error={loadError} title="Volumes could not be loaded" />
      <ApiErrorAlert error={action.error} title="The volume action failed" />
      <ResourceTable
        rows={volumes}
        getId={(row) => row.id}
        columns={columns}
        selectedIds={selected.map((item) => item.id)}
        onSelectedIds={setSelectedIds}
        emptyTitle="No volumes"
        emptyMessage="You currently have no volumes in this region"
        filterPlaceholder="Search"
        presets={[
          { id: "gp3", label: "gp3", match: (row) => row.volumeType === "gp3" },
          { id: "large", label: "20 GiB or larger", match: (row) => row.sizeGiB >= 20 },
        ]}
        hideRefresh
      />
      <DetailDock
        title={one ? `Volume ID: ${one.id}` : "Fault tolerance for all volumes in this Region"}
        height={dock}
        onHeight={setDock}
      >
        {one ? (
          <dl className="grid gap-x-8 gap-y-3 text-[13px] sm:grid-cols-3">
            {[
              ["Volume ID", one.id],
              ["Size", `${one.sizeGiB} GiB`],
              ["Type", one.volumeType],
              ["Volume state", volumeState(one)],
              ["IOPS", one.iops === null ? "—" : String(one.iops)],
              ["Throughput", dash(one.throughput)],
              ["Availability Zone", one.availabilityZone],
              ["Created", dash(one.created)],
              ["Attached instance", dash(one.attachedTo)],
              ["Snapshot ID", dash(one.snapshotId)],
              ["Source volume ID", dash(one.sourceVolumeId)],
              ["Owner ID", dash(one.owner)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="font-semibold text-[#5f6b7a]">{k}</dt>
                <dd className="break-all">{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {!one ? (
          <article className="rounded-lg border border-[#e6e8eb] p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-[16px] font-bold">Snapshot summary</h3>
              <span className="flex items-center gap-2 text-[12px] text-[#5f6b7a]">
                Last updated {updated}
                <RefreshButton onClick={refresh} />
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-[13px] text-[#5f6b7a]">
              Snapshots back up a volume on demand, or on a schedule you attach to a lifecycle policy or a backup plan.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[13px] font-semibold">Volumes with a snapshot / Total # volumes</p>
                <p className="mt-1 text-[13px]">
                  {backedUp} / {volumes.length}
                </p>
              </div>
              <div className="sm:border-l sm:border-[#e6e8eb] sm:pl-4">
                <p className="flex items-center gap-1 text-[13px] font-semibold">
                  Default snapshot policy status
                  <InfoTip text="Lifecycle manager would schedule snapshots. This preview only counts volumes that already have a snapshot id." />
                </p>
                <p className="mt-1 text-[13px] text-[#5f6b7a]">No default policy set up</p>
              </div>
            </div>
          </article>
        ) : null}
      </DetailDock>
      <PanelDialog
        open={recycleOpen}
        title="Recycle bin"
        onClose={() => setRecycleOpen(false)}
        footer={<OutlineButton onClick={() => setRecycleOpen(false)}>Close</OutlineButton>}
      >
        <p>The recycle bin is empty. Deleted volumes are removed immediately.</p>
      </PanelDialog>
      <PanelDialog
        open={snapOpen}
        title="Create snapshot"
        onClose={() => setSnapOpen(false)}
        footer={
          <>
            <OutlineButton onClick={() => setSnapOpen(false)}>Cancel</OutlineButton>
            <OrangeButton
              disabled={action.pending}
              onClick={() => {
                if (one) action.run(() => createSnapshotAction(one.id, snapDescription), () => setSnapOpen(false));
              }}
            >
              Create snapshot
            </OrangeButton>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <FieldLabel>Volume ID</FieldLabel>
            <p className="text-[13px]">{one?.id ?? "—"}</p>
          </div>
          <div>
            <FieldLabel>Description</FieldLabel>
            <input className="field" value={snapDescription} onChange={(event) => setSnapDescription(event.target.value)} />
          </div>
        </div>
      </PanelDialog>
      <PanelDialog
        open={createOpen}
        title="Create volume"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <OutlineButton onClick={() => setCreateOpen(false)}>Cancel</OutlineButton>
            <OrangeButton
              disabled={action.pending}
              onClick={() => action.run(() => createVolumeAction(Number(form.sizeGiB) || 1, form.volumeType), () => setCreateOpen(false))}
            >
              Create volume
            </OrangeButton>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <FieldLabel>Type</FieldLabel>
            <select className="field" value={form.volumeType} onChange={(event) => setForm({ ...form, volumeType: event.target.value })}>
              {VOLUME_TYPES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Size (GiB)</FieldLabel>
            <input className="field" type="number" min={1} value={form.sizeGiB} onChange={(event) => setForm({ ...form, sizeGiB: Number(event.target.value) })} />
          </div>
          <ApiErrorAlert error={action.error} title="The volume could not be created" />
        </div>
      </PanelDialog>
    </Shell>
  );
}

function RefreshButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Refresh"
      className="grid size-8 place-items-center rounded-full border-2 border-[#006ce0] text-[#006ce0] hover:bg-[#f2f8fd]"
      onClick={onClick}
    >
      <RefreshCw className="size-3.5" />
    </button>
  );
}
