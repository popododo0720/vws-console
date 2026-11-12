"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { Volume } from "@/types/console";
import { computeNav } from "@/lib/console-data";
import { attachedResource, formatEc2Time, formatSummaryTime } from "@/lib/ebs";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { RefreshIconButton, primaryPill, secondaryPill } from "@/components/sites/console/ebs-form-parts";
import { DetailLink } from "@/components/sites/console/resource-detail";
import { deleteVolumesAction, modifyVolumeAction } from "@/app/actions/resources";
import { DetachVolumeDialog, type DetachMode } from "@/components/sites/console/detach-volume-dialog";
import type { ApiError } from "@/lib/vws-api/adapter";
import { DetailDock } from "@/components/sites/console/detail-dock";
import { PageHeader } from "@/components/sites/console/page-header";
import { Column, NameCell, ResourceTable } from "@/components/sites/console/resource-table";
import { Shell } from "@/components/sites/console/shell";
import {
  DetailGrid,
  FieldLabel,
  MenuButton,
  OrangeButton,
  OutlineButton,
  PanelDialog,
  dash,
  menuTriggerClass,
  orangeLinkClass,
} from "@/components/sites/console/ui";

function volumeState(row: Volume) {
  return row.state ? row.state.charAt(0).toUpperCase() + row.state.slice(1) : "—";
}

export function VolumesView({
  volumes,
  loadError,
  loadedAt,
}: {
  volumes: Volume[];
  loadError: ApiError | null;
  /** When the server read the volumes, as ISO 8601. */
  loadedAt: string;
}) {
  const action = useApiAction();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dock, setDock] = useState(240);
  const [updated, setUpdated] = useState("less than a minute ago");
  const [recycleOpen, setRecycleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [modifySize, setModifySize] = useState(0);
  const [detachMode, setDetachMode] = useState<DetachMode | null>(null);
  const selected = volumes.filter((item) => selectedIds.includes(item.id));
  const one = selected.length === 1 ? selected[0] : null;
  const refresh = () => {
    setUpdated("less than a minute ago");
    action.refresh();
  };

  const columns: Column<Volume>[] = [
    {
      key: "name",
      header: "Name",
      minWidth: 140,
      sortValue: (row) => row.name,
      cell: (row) => <NameCell value={row.name} />,
    },
    {
      key: "id",
      header: "Volume ID",
      minWidth: 180,
      sortValue: (row) => row.id,
      cell: (row) => <DetailLink href={`/storage/volumes/${row.id}`} id={row.id} />,
    },
    { key: "type", header: "Type", minWidth: 100, sortValue: (row) => row.volumeType, cell: (row) => row.volumeType },
    {
      key: "size",
      header: "Size",
      minWidth: 100,
      sortValue: (row) => String(row.sizeGiB).padStart(6, "0"),
      cell: (row) => `${row.sizeGiB} GiB`,
    },
    {
      key: "iops",
      header: "IOPS",
      minWidth: 100,
      sortValue: (row) => String(row.iops ?? "").padStart(7, "0"),
      cell: (row) => (row.iops === null ? "—" : row.iops),
    },
    {
      key: "throughput",
      header: "Throughput",
      minWidth: 120,
      sortValue: (row) => row.throughput.padStart(5, "0"),
      cell: (row) => dash(row.throughput),
    },
    { key: "owner", header: "Owner ID", minWidth: 140, sortValue: (row) => row.owner, cell: (row) => dash(row.owner) },
    {
      key: "snapshot",
      header: "Snapshot ID",
      minWidth: 140,
      sortValue: (row) => row.snapshotId,
      cell: (row) =>
        row.snapshotId ? <DetailLink href={`/storage/snapshots/${row.snapshotId}`} id={row.snapshotId} /> : "—",
    },
    {
      key: "source",
      header: "Source volume ID",
      minWidth: 160,
      sortValue: (row) => row.sourceVolumeId,
      cell: (row) => dash(row.sourceVolumeId),
    },
    {
      key: "created",
      header: "Created",
      minWidth: 200,
      sortValue: (row) => row.created,
      cell: (row) => dash(formatEc2Time(row.created)),
    },
    {
      key: "az",
      header: "Availability Zone",
      minWidth: 150,
      sortValue: (row) => row.availabilityZone,
      cell: (row) => row.availabilityZone,
    },
    {
      key: "state",
      header: "Volume state",
      minWidth: 120,
      sortValue: (row) => volumeState(row),
      cell: (row) => volumeState(row),
    },
    {
      key: "attached",
      header: "Attached resources",
      minWidth: 220,
      sortValue: (row) => attachedResource(row.attachment),
      cell: (row) => dash(attachedResource(row.attachment)),
    },
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
            <RefreshIconButton label="Refresh" onClick={refresh} />
            <OutlineButton className={secondaryPill} onClick={() => setRecycleOpen(true)}>
              <ExternalLink className="size-3.5" />
              Recycle Bin
            </OutlineButton>
            <MenuButton
              className={`${menuTriggerClass()} ${secondaryPill} gap-1.5`}
              label={
                <>
                  Actions{" "}
                  <span aria-hidden className="text-[9px]">
                    ▼
                  </span>
                </>
              }
              items={[
                {
                  label: "Modify volume",
                  disabled: !one,
                  onSelect: () => {
                    if (!one) return;
                    action.clear();
                    setModifySize(one.sizeGiB + 1);
                    setModifyOpen(true);
                  },
                },
                {
                  label: "Create snapshot",
                  disabled: !one,
                  href: one ? `/storage/snapshots/create?volumeId=${one.id}` : undefined,
                },
                { label: "Create snapshot lifecycle policy", disabled: true },
                {
                  label: "Delete volume",
                  disabled: action.pending || selected.length === 0,
                  onSelect: () => {
                    action.clear();
                    setDeleteOpen(true);
                  },
                },
                {
                  label: "Attach volume",
                  disabled: !one || one.state !== "available",
                  href: one ? `/storage/volumes/${one.id}/attach` : undefined,
                },
                {
                  label: "Detach volume",
                  disabled: action.pending || !one || one.state !== "in-use",
                  onSelect: () => setDetachMode("detach"),
                },
                {
                  label: "Force detach volume",
                  disabled: action.pending || !one || one.state !== "in-use",
                  onSelect: () => setDetachMode("force"),
                },
                { label: "Manage auto-enabled I/O", disabled: true },
                { label: "Manage tags", disabled: true },
              ]}
            />
            <Link href="/storage/volumes/create" className={`${orangeLinkClass} ${primaryPill}`}>
              Create volume
            </Link>
          </>
        }
      />
      <ApiErrorAlert error={loadError} title="Volumes could not be loaded" />
      <ResourceTable
        rows={volumes}
        region={(row) => row.region}
        getId={(row) => row.id}
        columns={columns}
        selectedIds={selected.map((item) => item.id)}
        onSelectedIds={setSelectedIds}
        emptyTitle=""
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
          <DetailGrid
            items={[
              ["Volume ID", one.id],
              ["Size", `${one.sizeGiB} GiB`],
              ["Type", one.volumeType],
              ["Volume state", volumeState(one)],
              ["IOPS", one.iops === null ? "—" : String(one.iops)],
              ["Throughput", dash(one.throughput)],
              ["Availability Zone", one.availabilityZone],
              ["Created", dash(formatEc2Time(one.created))],
              ["Attached resources", dash(attachedResource(one.attachment))],
              ["Snapshot ID", dash(one.snapshotId)],
              ["Source volume ID", dash(one.sourceVolumeId)],
              ["Owner ID", dash(one.owner)],
            ]}
          />
        ) : (
          <article className="rounded-2xl border border-[#c6c6cd] px-5 py-4 text-[14px]">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-[18px] font-bold">Snapshot summary</h3>
              <span className="flex items-center gap-2">
                Last updated on {formatSummaryTime(loadedAt)}
                <RefreshIconButton label="Refresh snapshot summary" onClick={refresh} />
              </span>
            </div>
            <p className="mt-1">
              Snapshots to back up volumes can be manually created, or created through automation such as VWS Data
              Lifecycle Manager, VWS Backup, custom scripts, or third-party tools.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="font-bold">Volumes backed up in the last 24 hours / Total # volumes</p>
                <p className="mt-1" title="console-api does not report when a snapshot started.">
                  — / {volumes.length}
                </p>
              </div>
              <div className="sm:border-l sm:border-[#c6c6cd] sm:pl-5">
                <p className="font-bold">Data Lifecycle Manager default policy for EBS Snapshots status</p>
                <p className="mt-1">No default policy set up</p>
              </div>
            </div>
          </article>
        )}
      </DetailDock>
      <PanelDialog
        open={recycleOpen}
        title="Recycle Bin"
        onClose={() => setRecycleOpen(false)}
        footer={<OutlineButton onClick={() => setRecycleOpen(false)}>Close</OutlineButton>}
      >
        <p>The Recycle Bin is empty. Deleted volumes are removed immediately.</p>
      </PanelDialog>
      <PanelDialog
        open={modifyOpen}
        title="Modify volume"
        onClose={() => setModifyOpen(false)}
        footer={
          <>
            <OutlineButton onClick={() => setModifyOpen(false)}>Cancel</OutlineButton>
            <OrangeButton
              disabled={action.pending || !one || modifySize <= one.sizeGiB}
              onClick={() => {
                if (one)
                  action.run(
                    () => modifyVolumeAction(one.id, modifySize),
                    () => setModifyOpen(false),
                  );
              }}
            >
              Modify
            </OrangeButton>
          </>
        }
      >
        <ApiErrorAlert error={action.error} title="The volume could not be modified" />
        <div className="space-y-3">
          <div>
            <FieldLabel>Volume ID</FieldLabel>
            <p className="text-[13px]">{one?.id ?? "—"}</p>
          </div>
          <div>
            <FieldLabel>Size (GiB)</FieldLabel>
            <input
              className="field"
              type="number"
              aria-label="New size (GiB)"
              min={(one?.sizeGiB ?? 0) + 1}
              value={modifySize}
              onChange={(event) => setModifySize(Number(event.target.value))}
            />
            <p className="mt-1 text-[12px] text-[#5f6b7a]">
              A volume can only grow. Current size: {one ? `${one.sizeGiB} GiB` : "—"}. Volume type, IOPS and throughput
              cannot be changed.
            </p>
          </div>
        </div>
      </PanelDialog>
      {detachMode && one ? (
        <DetachVolumeDialog volume={one} mode={detachMode} onClose={() => setDetachMode(null)} />
      ) : null}
      <PanelDialog
        open={deleteOpen}
        title={selected.length > 1 ? "Delete volumes" : "Delete volume"}
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <OutlineButton onClick={() => setDeleteOpen(false)}>Cancel</OutlineButton>
            <OrangeButton
              disabled={action.pending || selected.length === 0}
              onClick={() =>
                action.run(
                  async () => {
                    const failure = await deleteVolumesAction(selected.map((item) => item.id));
                    if (failure) action.refresh();
                    return failure;
                  },
                  () => {
                    setSelectedIds([]);
                    setDeleteOpen(false);
                  },
                )
              }
            >
              Delete
            </OrangeButton>
          </>
        }
      >
        <ApiErrorAlert error={action.error} title="The volume could not be deleted" />
        <p>Are you sure you want to delete the following {selected.length > 1 ? "volumes" : "volume"}?</p>
        <ul className="mt-2 list-disc pl-5 font-mono text-[12px]">
          {selected.map((item) => (
            <li key={item.id}>{item.id}</li>
          ))}
        </ul>
        <p className="mt-2 text-[#5f6b7a]">Deleted volumes cannot be recovered.</p>
      </PanelDialog>
    </Shell>
  );
}
