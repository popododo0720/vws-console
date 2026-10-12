"use client";

import { useState } from "react";
import type { Volume } from "@/types/console";
import { computeNav, volumeTypeOptions, zonesFor } from "@/lib/console-data";
import { useConsole } from "@/components/sites/console/console-provider";
import { DetailDock } from "@/components/sites/console/detail-dock";
import { PageHeader } from "@/components/sites/console/page-header";
import { Column, NameCell, ResourceTable } from "@/components/sites/console/resource-table";
import { Shell } from "@/components/sites/console/shell";
import {
  CopyText,
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

export function VolumesView() {
  const api = useConsole();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dock, setDock] = useState(240);
  const [updated, setUpdated] = useState("Last updated less than a minute ago");
  const [createOpen, setCreateOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [recycleOpen, setRecycleOpen] = useState(false);
  const [form, setForm] = useState({ name: "", volumeType: "General SSD", sizeGiB: 8, availabilityZone: zonesFor(api.region)[0] ?? "north-a" });
  const selected = api.volumes.filter((item) => selectedIds.includes(item.id));
  const one = selected.length === 1 ? selected[0] : null;
  const backedUp = api.volumes.filter((item) => item.snapshotId).length;

  const columns: Column<Volume>[] = [
    { key: "name", header: "Name", minWidth: 140, sortValue: (row) => row.name, cell: (row) => <NameCell value={row.name} /> },
    { key: "id", header: "Volume ID", minWidth: 180, sortValue: (row) => row.id, cell: (row) => <CopyText value={row.id} /> },
    { key: "type", header: "Type", minWidth: 130, sortValue: (row) => row.volumeType, cell: (row) => row.volumeType },
    { key: "size", header: "Size", minWidth: 80, sortValue: (row) => String(row.sizeGiB), cell: (row) => `${row.sizeGiB} GiB` },
    { key: "iops", header: "IOPS", minWidth: 80, sortValue: (row) => String(row.iops), cell: (row) => row.iops },
    { key: "throughput", header: "Throughput", minWidth: 110, sortValue: (row) => row.throughput, cell: (row) => row.throughput },
    { key: "owner", header: "Owner", minWidth: 140, sortValue: (row) => row.owner, cell: (row) => row.owner },
    { key: "snapshot", header: "Snapshot ID", minWidth: 120, sortValue: (row) => row.snapshotId, cell: (row) => dash(row.snapshotId) },
    { key: "source", header: "Source volume ID", minWidth: 150, sortValue: (row) => row.sourceVolumeId, cell: (row) => dash(row.sourceVolumeId) },
    { key: "created", header: "Created", minWidth: 120, sortValue: (row) => row.created, cell: (row) => row.created },
    { key: "az", header: "Availability", minWidth: 120, sortValue: (row) => row.availabilityZone, cell: (row) => row.availabilityZone },
  ];

  return (
    <Shell tree={computeNav}>
      <PageHeader
        mark="C"
        crumbs={[{ label: "EC2", href: "/compute/instances" }, { label: "Volumes" }]}
        info="Volumes are block disks in the current region. Attachment is shown when a volume is tied to an instance."
        meta={updated}
        actions={
          <>
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
                  label: "Delete",
                  disabled: selected.length === 0,
                  onSelect: () => api.deleteVolumes(selected.map((item) => item.id)),
                },
              ]}
            />
            <OrangeButton onClick={() => setCreateOpen(true)}>Create volume</OrangeButton>
          </>
        }
      />
      <ResourceTable
        rows={api.volumes}
        getId={(row) => row.id}
        columns={columns}
        selectedIds={selected.map((item) => item.id)}
        onSelectedIds={setSelectedIds}
        emptyTitle="No volumes"
        emptyMessage="You currently have no volumes in this region"
        filterPlaceholder="Search"
        presets={[
          { id: "ssd", label: "General SSD", match: (row) => row.volumeType === "General SSD" },
          { id: "large", label: "20 GiB or larger", match: (row) => row.sizeGiB >= 20 },
        ]}
        onRefresh={() => setUpdated("Last updated less than a minute ago")}
      />
      <DetailDock title="Fault tolerance for all volumes" height={dock} onHeight={setDock}>
        {one ? (
          <p className="mb-3 text-[13px]">
            Selected {one.id}
            {one.attachedTo ? ` · attached to ${one.attachedTo}` : " · not attached"}
          </p>
        ) : null}
        <article className="rounded-lg border border-[#e6e8eb] p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-semibold">Snapshot summary</h3>
            <span className="text-[12px] text-[#5f6b7a]">{updated}</span>
          </div>
          <p className="mt-2 max-w-3xl text-[13px] text-[#5f6b7a]">
            Snapshots back up a volume on demand, or on a schedule you attach to a lifecycle policy or a backup plan.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[13px] font-semibold">Volumes backed up in the last 24 hours / Total # volumes</p>
              <p className="mt-2 text-[20px]">
                {backedUp} / {api.volumes.length}
              </p>
            </div>
            <div>
              <button type="button" className="inline-flex items-center gap-1 text-[13px] font-semibold" onClick={() => setPolicyOpen((value) => !value)}>
                Snapshot policy status <MenuChevron />
              </button>
              {policyOpen ? <p className="mt-2 text-[13px] text-[#5f6b7a]">No default policy is attached in this region.</p> : null}
              <div className="mt-3 flex gap-3 text-[13px]">
                <InfoTip text="Lifecycle manager would schedule snapshots. This preview only counts volumes that already have a snapshot id." />
              </div>
            </div>
          </div>
        </article>
      </DetailDock>
      <PanelDialog
        open={recycleOpen}
        title="Recycle bin"
        onClose={() => setRecycleOpen(false)}
        footer={<OutlineButton onClick={() => setRecycleOpen(false)}>Close</OutlineButton>}
      >
        <p>The recycle bin is empty. Deleted volumes in this preview are removed immediately.</p>
      </PanelDialog>
      <PanelDialog
        open={createOpen}
        title="Create volume"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <OutlineButton onClick={() => setCreateOpen(false)}>Cancel</OutlineButton>
            <OrangeButton
              onClick={() => {
                api.createVolume({ ...form, sizeGiB: Number(form.sizeGiB) || 1 });
                setCreateOpen(false);
              }}
            >
              Create volume
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
            <FieldLabel>Type</FieldLabel>
            <select className="field" value={form.volumeType} onChange={(event) => setForm({ ...form, volumeType: event.target.value })}>
              {volumeTypeOptions.map((item) => (
                <option key={item.id}>{item.id}</option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Size (GiB)</FieldLabel>
            <input className="field" type="number" min={1} value={form.sizeGiB} onChange={(event) => setForm({ ...form, sizeGiB: Number(event.target.value) })} />
          </div>
          <div>
            <FieldLabel>Availability Zone</FieldLabel>
            <select className="field" value={form.availabilityZone} onChange={(event) => setForm({ ...form, availabilityZone: event.target.value })}>
              {zonesFor(api.region).map((zone) => (
                <option key={zone}>{zone}</option>
              ))}
            </select>
          </div>
        </div>
      </PanelDialog>
    </Shell>
  );
}
