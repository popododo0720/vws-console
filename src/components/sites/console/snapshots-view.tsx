"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { Snapshot } from "@/types/console";
import { computeNav } from "@/lib/console-data";
import { snapshotProgress } from "@/lib/ebs";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { deleteSnapshotsAction } from "@/app/actions/resources";
import type { ApiError } from "@/lib/vws-api/adapter";
import { DetailDock } from "@/components/sites/console/detail-dock";
import { RefreshIconButton, primaryPill, secondaryPill } from "@/components/sites/console/ebs-form-parts";
import { PageHeader } from "@/components/sites/console/page-header";
import { DetailLink } from "@/components/sites/console/resource-detail";
import { Column, NameCell, ResourceTable } from "@/components/sites/console/resource-table";
import { Shell } from "@/components/sites/console/shell";
import { snapshotFields } from "@/components/sites/console/snapshot-detail-view";
import {
  DetailGrid,
  MenuButton,
  OrangeButton,
  OutlineButton,
  PanelDialog,
  dash,
  menuTriggerClass,
  orangeLinkClass,
  ActionLink,
} from "@/components/sites/console/ui";

function snapshotState(row: Snapshot) {
  return row.state ? row.state.charAt(0).toUpperCase() + row.state.slice(1) : "—";
}

const columns: Column<Snapshot>[] = [
  {
    key: "name",
    header: "Name",
    minWidth: 140,
    sortValue: (row) => row.name,
    cell: (row) => <NameCell value={row.name} />,
  },
  {
    key: "id",
    header: "Snapshot ID",
    minWidth: 200,
    sortValue: (row) => row.id,
    cell: (row) => <DetailLink href={`/storage/snapshots/${row.id}`} id={row.id} />,
  },
  { key: "full", header: "Full snapshot size", minWidth: 160, sortValue: () => "", cell: () => "—" },
  {
    key: "size",
    header: "Volume size",
    minWidth: 120,
    sortValue: (row) => String(row.sizeGiB).padStart(6, "0"),
    cell: (row) => `${row.sizeGiB} GiB`,
  },
  {
    key: "desc",
    header: "Description",
    minWidth: 200,
    sortValue: (row) => row.description,
    cell: (row) => dash(row.description),
  },
  { key: "tier", header: "Storage tier", minWidth: 120, sortValue: () => "Standard", cell: () => "Standard" },
  {
    key: "state",
    header: "Snapshot status",
    minWidth: 150,
    sortValue: (row) => row.state,
    cell: (row) => snapshotState(row),
  },
  {
    key: "started",
    header: "Started",
    minWidth: 180,
    sortValue: (row) => row.started,
    cell: (row) => dash(row.started),
  },
  {
    key: "progress",
    header: "Progress",
    minWidth: 150,
    sortValue: (row) => snapshotProgress(row.state),
    cell: (row) => snapshotProgress(row.state),
  },
  {
    key: "volume",
    header: "Volume ID",
    minWidth: 200,
    sortValue: (row) => row.volumeId,
    cell: (row) => <DetailLink href={`/storage/volumes/${row.volumeId}`} id={row.volumeId} />,
  },
  { key: "owner", header: "Owner ID", minWidth: 140, sortValue: (row) => row.owner, cell: (row) => dash(row.owner) },
];

export function SnapshotsView({ snapshots, loadError }: { snapshots: Snapshot[]; loadError: ApiError | null }) {
  const action = useApiAction();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dock, setDock] = useState(240);
  const [updated, setUpdated] = useState("less than a minute ago");
  const [recycleOpen, setRecycleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const selected = snapshots.filter((item) => selectedIds.includes(item.id));
  const one = selected.length === 1 ? selected[0] : null;

  return (
    <Shell tree={computeNav}>
      <PageHeader
        mark="C"
        crumbs={[{ label: "EC2", href: "/compute/instances" }, { label: "Snapshots" }]}
        info="Snapshots are point-in-time backups of volumes in the current region."
        actions={
          <>
            <span className="text-right text-[12px] leading-4 text-[#5f6b7a]">
              Last updated
              <br />
              {updated}
            </span>
            <RefreshIconButton
              label="Refresh"
              onClick={() => {
                setUpdated("less than a minute ago");
                action.refresh();
              }}
            />
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
                  label: "Create volume from snapshot",
                  action: "ec2:CreateVolume",
                  disabled: !one || one.state !== "completed",
                  href: one ? `/storage/volumes/create?snapshotId=${one.id}` : undefined,
                },
                { label: "Create image from snapshot", disabled: true },
                { label: "Copy snapshot", disabled: true },
                {
                  label: "Delete snapshot",
                  action: "ec2:DeleteSnapshot",
                  disabled: action.pending || selected.length === 0,
                  onSelect: () => {
                    action.clear();
                    setDeleteOpen(true);
                  },
                },
                { label: "Manage tags", disabled: true },
              ]}
            />
            <ActionLink
              action="ec2:CreateSnapshot"
              href="/storage/snapshots/create"
              className={`${orangeLinkClass} ${primaryPill}`}
            >
              Create snapshot
            </ActionLink>
          </>
        }
      />
      <ApiErrorAlert error={loadError} title="Snapshots could not be loaded" />
      <ApiErrorAlert error={action.error} title="The snapshot action failed" />
      <ResourceTable
        rows={snapshots}
        region={(row) => row.region}
        getId={(row) => row.id}
        columns={columns}
        selectedIds={selected.map((item) => item.id)}
        onSelectedIds={setSelectedIds}
        emptyTitle=""
        emptyMessage="You currently have no snapshots in this Region."
        presetLabel="Snapshot scope"
        presetPlaceholder="Owned by me"
        filterPlaceholder="Search"
        hideRefresh
      />
      <DetailDock title={one ? `Snapshot ID: ${one.id}` : "Select a snapshot above."} height={dock} onHeight={setDock}>
        {one ? <DetailGrid items={snapshotFields(one)} /> : null}
      </DetailDock>
      <PanelDialog
        open={recycleOpen}
        title="Recycle Bin"
        onClose={() => setRecycleOpen(false)}
        footer={<OutlineButton onClick={() => setRecycleOpen(false)}>Close</OutlineButton>}
      >
        <p>The Recycle Bin is empty. Deleted snapshots are removed immediately.</p>
      </PanelDialog>
      <PanelDialog
        open={deleteOpen}
        title={selected.length > 1 ? "Delete snapshots" : "Delete snapshot"}
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <OutlineButton onClick={() => setDeleteOpen(false)}>Cancel</OutlineButton>
            <OrangeButton
              disabled={action.pending || selected.length === 0}
              onClick={() =>
                action.run(
                  async () => {
                    const failure = await deleteSnapshotsAction(selected.map((item) => item.id));
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
        <ApiErrorAlert error={action.error} title="The snapshot could not be deleted" />
        <p>Are you sure you want to delete the following {selected.length > 1 ? "snapshots" : "snapshot"}?</p>
        <ul className="mt-2 list-disc pl-5 font-mono text-[12px]">
          {selected.map((item) => (
            <li key={item.id}>{item.id}</li>
          ))}
        </ul>
        <p className="mt-2 text-[#5f6b7a]">Deleted snapshots cannot be recovered.</p>
      </PanelDialog>
    </Shell>
  );
}
