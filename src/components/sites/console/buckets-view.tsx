"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { deleteBucketsAction } from "@/app/actions/resources";
import type { AccountBucket, ApiError } from "@/lib/vws-api/adapter";
import { formatBucketCreationDate } from "@/lib/bucket-display";
import { storageNav } from "@/lib/console-data";
import { ApiErrorAlert } from "@/components/sites/console/api-action";
import { useConsole } from "@/components/sites/console/console-provider";
import { PageHeader } from "@/components/sites/console/page-header";
import { Column, ResourceTable } from "@/components/sites/console/resource-table";
import { Shell } from "@/components/sites/console/shell";
import {
  FieldLabel,
  orangeLinkClass,
  InfoTip,
  OrangeButton,
  OutlineButton,
  PanelDialog,
} from "@/components/sites/console/ui";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";

// The resource name scheme is not settled with vws-api yet. Keep it in one place.
function bucketArn(name: string) {
  return `arn:vws:s3:::${name}`;
}

export function BucketsView({ buckets, loadError }: { buckets: readonly AccountBucket[]; loadError: ApiError | null }) {
  const api = useConsole();
  const router = useRouter();
  const [deleteError, setDeleteError] = useState<ApiError | null>(null);
  const [pending, startTransition] = useTransition();
  const params = useSearchParams();
  const tab = params.get("tab") === "directory" ? "directory" : "general";
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deletedNames, setDeletedNames] = useState<ReadonlySet<string>>(() => new Set());
  const [dialog, setDialog] = useState<"empty" | "delete" | null>(null);
  const [confirm, setConfirm] = useState("");
  const [emptyNotice, setEmptyNotice] = useState(false);
  const [dash, setDash] = useState(false);
  const [cards, setCards] = useState({ snapshot: false, access: false });
  const visibleBuckets = buckets.filter((bucket) => !deletedNames.has(bucket.name));
  const rows = tab === "directory" ? [] : visibleBuckets;
  const selected = rows.filter((item) => selectedIds.includes(item.name));
  const generalCount = visibleBuckets.length;
  const directoryCount = 0;

  const setTab = (next: "general" | "directory") => {
    const query = new URLSearchParams(params.toString());
    if (next === "directory") query.set("tab", "directory");
    else query.delete("tab");
    const search = query.toString();
    router.replace(search ? `/storage/buckets?${search}` : "/storage/buckets");
    setSelectedIds([]);
  };

  const openAction = (next: "empty" | "delete") => {
    setConfirm("");
    setEmptyNotice(false);
    setDialog(next);
  };
  const confirmWord = dialog === "empty" ? "permanently delete" : selected.length === 1 ? selected[0].name : "delete";

  const columns: Column<AccountBucket>[] = [
    {
      key: "name",
      header: "Name",
      minWidth: 220,
      sortValue: (row) => row.name,
      cell: (row) => (
        <Link
          href={`/storage/buckets/${encodeURIComponent(row.name)}`}
          className="text-[#006ce0] hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {row.name}
        </Link>
      ),
    },
    { key: "region", header: "VWS Region", minWidth: 160, sortValue: () => "—", cell: () => "—" },
    {
      key: "created",
      header: "Creation date",
      minWidth: 140,
      sortValue: (row) => row.created,
      cell: (row) => formatBucketCreationDate(row.created),
    },
  ];

  return (
    <Shell tree={storageNav}>
      <div className="min-h-0 flex-1 overflow-auto bg-[#f3f3f5]">
        <div className="flex flex-col gap-4 p-4 xl:flex-row">
          <div className="min-w-0 flex-1">
            <PageHeader
              mark="B"
              crumbs={[{ label: "S3", href: "/storage/buckets" }, { label: "Buckets" }]}
              info="Buckets hold objects."
            />
            <ApiErrorAlert error={loadError} title="Buckets could not be loaded" />
            <ApiErrorAlert error={deleteError} title="The bucket action failed" />
            <div className="mb-3 flex gap-4 px-4 text-[14px]">
              <button
                type="button"
                className={cn(
                  "border-b-2 pb-2",
                  tab === "general"
                    ? "border-[#006ce0] font-semibold text-[#006ce0]"
                    : "border-transparent text-[#16191f]",
                )}
                onClick={() => setTab("general")}
              >
                General purpose buckets
                <span className="ml-2 rounded bg-[#414d5c] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                  All Regions
                </span>
              </button>
              <button
                type="button"
                className={cn(
                  "border-b-2 pb-2",
                  tab === "directory"
                    ? "border-[#006ce0] font-semibold text-[#006ce0]"
                    : "border-transparent text-[#16191f]",
                )}
                onClick={() => setTab("directory")}
              >
                Directory buckets
              </button>
            </div>
            <div className="mx-4 rounded-lg border border-[#e6e8eb] bg-white p-3">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="mr-auto">
                  <h2 className="flex items-center gap-2 text-[18px] font-bold">
                    {tab === "general" ? "General purpose buckets" : "Directory buckets"}
                    <span className="font-normal text-[#5f6b7a]">
                      ({tab === "general" ? generalCount : directoryCount})
                    </span>
                  </h2>
                  <p className="text-[12px] text-[#5f6b7a]">
                    Buckets are containers for data stored in object storage.
                  </p>
                </div>
                <RefreshButton onClick={() => router.refresh()} />
                <OutlineButton
                  disabled={selected.length !== 1}
                  onClick={() => void copyToClipboard(bucketArn(selected[0].name), "buckets-view")}
                >
                  Copy ARN
                </OutlineButton>
                <OutlineButton disabled={selected.length === 0} onClick={() => openAction("empty")}>
                  Empty
                </OutlineButton>
                <OutlineButton disabled={selected.length === 0} onClick={() => openAction("delete")}>
                  Delete
                </OutlineButton>
                <Link href="/storage/buckets/create" className={orangeLinkClass}>
                  Create bucket
                </Link>
              </div>
              <ResourceTable
                className="px-0 pb-0"
                rows={rows}
                getId={(row) => row.name}
                columns={columns}
                selectedIds={selected.map((item) => item.name)}
                onSelectedIds={setSelectedIds}
                emptyTitle="No buckets"
                emptyMessage={
                  tab === "general" ? "You don't have any buckets." : "You don't have any directory buckets."
                }
                emptyAction={{ label: "Create bucket", href: "/storage/buckets/create" }}
                filterPlaceholder="Find buckets by name"
                initialSort={{ key: "name", dir: "asc" }}
                hideRefresh
              />
            </div>
          </div>
          <aside className="w-full shrink-0 space-y-4 xl:w-[300px]">
            <SideCard
              title="Account snapshot"
              info="Counts come from the records currently loaded in this session."
              open={cards.snapshot}
              onToggle={() => setCards((value) => ({ ...value, snapshot: !value.snapshot }))}
              action={<OutlineButton onClick={() => setDash((value) => !value)}>View dashboard</OutlineButton>}
              summary="Storage lens shows storage usage and activity trends."
            >
              {dash ? (
                <dl className="space-y-1 text-[13px]">
                  <div className="flex justify-between">
                    <dt>Buckets</dt>
                    <dd>{visibleBuckets.length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Instances in region</dt>
                    <dd>{api.instances.length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Volumes in region</dt>
                    <dd>{api.volumes.length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>VPCs in region</dt>
                    <dd>{api.vpcs.length}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-[13px] text-[#5f6b7a]">Open the dashboard to see counts for this session.</p>
              )}
            </SideCard>
            <SideCard
              title="External access summary"
              info="Findings list buckets whose policy would allow access from outside the account."
              open={cards.access}
              onToggle={() => setCards((value) => ({ ...value, access: !value.access }))}
              summary="External access findings identify bucket permissions that allow public access or access from other accounts."
            >
              <p className="text-[13px] text-[#5f6b7a]">No findings are recorded.</p>
            </SideCard>
          </aside>
        </div>
      </div>
      <PanelDialog
        open={dialog !== null}
        title={dialog === "empty" ? "Empty bucket" : "Delete bucket"}
        onClose={() => setDialog(null)}
        footer={
          <>
            <OutlineButton onClick={() => setDialog(null)}>Cancel</OutlineButton>
            <OrangeButton
              disabled={confirm !== confirmWord || pending}
              onClick={() => {
                if (dialog === "empty") {
                  setEmptyNotice(true);
                  return;
                }
                const chosen = selected.map((item) => item.name);
                startTransition(async () => {
                  const report = await deleteBucketsAction(chosen);
                  if (report.deleted.length > 0) {
                    setDeletedNames((current) => new Set([...current, ...report.deleted]));
                    router.refresh();
                  }
                  if (report.error) {
                    const removed = new Set(report.deleted);
                    setSelectedIds(selected.filter((item) => !removed.has(item.name)).map((item) => item.name));
                    setConfirm("");
                    setDeleteError(report.error);
                    return;
                  }
                  setSelectedIds([]);
                  setDeleteError(null);
                  setDialog(null);
                });
              }}
            >
              {dialog === "empty" ? "Empty" : "Delete bucket"}
            </OrangeButton>
          </>
        }
      >
        <p className="mb-3">
          {dialog === "empty"
            ? "Emptying permanently deletes all objects in the selected bucket. This action cannot be undone."
            : "Deleting a bucket cannot be undone. A bucket must be empty before it can be deleted."}
        </p>
        {emptyNotice ? <p className="mb-3 text-[#d13212]">Objects cannot be deleted from this console yet.</p> : null}
        {dialog === "delete" && deleteError ? <p className="mb-3 text-[#d13212]">{deleteError.message}</p> : null}
        <FieldLabel>To confirm, type “{confirmWord}”.</FieldLabel>
        <input className="field" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
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

function SideCard({
  title,
  info,
  open,
  onToggle,
  action,
  summary,
  children,
}: {
  title: string;
  info: string;
  open: boolean;
  onToggle: () => void;
  action?: ReactNode;
  summary: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[#e6e8eb] bg-white p-4">
      <div className="flex items-start gap-2">
        <div className="flex items-center gap-2">
          <button type="button" className="flex items-center gap-2 text-left" aria-expanded={open} onClick={onToggle}>
            <span aria-hidden className="w-3 text-[9px]">
              {open ? "▼" : "▶"}
            </span>
            <h2 className="whitespace-nowrap font-bold">{title}</h2>
          </button>
          <InfoTip text={info} />
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="rounded bg-[#414d5c] px-1.5 py-0.5 text-[11px] text-white">Updated daily</span>
        {action}
      </div>
      <p className="mt-2 text-[13px] text-[#5f6b7a]">{summary}</p>
      {open ? <div className="mt-3 border-t border-[#e6e8eb] pt-3">{children}</div> : null}
    </section>
  );
}
