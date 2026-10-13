"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Folder, File as FileIcon } from "lucide-react";
import { storageNav } from "@/lib/console-data";
import { formatBytes, listAtPrefix, validFolderName, type ObjectRow } from "@/lib/bucket-objects";
import { useConsole } from "@/components/sites/console/console-provider";
import { PageHeader } from "@/components/sites/console/page-header";
import { Column, ResourceTable } from "@/components/sites/console/resource-table";
import { Shell } from "@/components/sites/console/shell";
import { FieldLabel, OrangeButton, OutlineButton, PanelDialog, SampleBadge, dash } from "@/components/sites/console/ui";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";

const CONFIRM_WORD = "permanently delete";

export function BucketDetailView({ name }: { name: string }) {
  const api = useConsole();
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("tab") === "properties" ? "properties" : "objects";
  const prefix = params.get("prefix") ?? "";
  const bucket = api.buckets.find((item) => item.name === name);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirm, setConfirm] = useState("");

  const rows = useMemo(
    () => listAtPrefix(api.objects.filter((item) => item.bucket === name), prefix),
    [api.objects, name, prefix],
  );
  const base = `/storage/buckets/${encodeURIComponent(name)}`;
  const go = (next: { tab?: string; prefix?: string }) => {
    const query = new URLSearchParams();
    if (next.tab === "properties") query.set("tab", "properties");
    if (next.prefix) query.set("prefix", next.prefix);
    const search = query.toString();
    router.replace(search ? `${base}?${search}` : base);
    setSelectedIds([]);
  };

  if (!bucket) {
    return (
      <Shell tree={storageNav}>
        <PageHeader crumbs={[{ label: "S3", href: "/storage/buckets" }, { label: "Buckets", href: "/storage/buckets" }, { label: name }]} />
        <div className="px-4 py-6 text-[13px]">
          <p className="font-semibold">Bucket not found</p>
          <p className="mt-1 text-[#5f6b7a]">{name} is not in this account.</p>
          <Link href="/storage/buckets" className="mt-3 inline-block text-[#006ce0] hover:underline">
            Back to buckets
          </Link>
        </div>
      </Shell>
    );
  }

  const segments = prefix.split("/").filter(Boolean);
  const selectedRows = rows.filter((row) => selectedIds.includes(row.key));
  const uploadHref = `${base}/upload${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ""}`;

  const columns: Column<ObjectRow>[] = [
    {
      key: "name",
      header: "Name",
      minWidth: 260,
      sortValue: (row) => `${row.isFolder ? "0" : "1"}${row.name}`,
      cell: (row) =>
        row.isFolder ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 text-[#006ce0] hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              go({ prefix: row.key });
            }}
          >
            <Folder className="size-4 text-[#5f6b7a]" />
            {row.name}
          </button>
        ) : (
          <span className="inline-flex items-center gap-2 text-[#006ce0]">
            <FileIcon className="size-4 text-[#5f6b7a]" />
            {row.name}
          </span>
        ),
    },
    { key: "type", header: "Type", minWidth: 100, sortValue: (row) => (row.isFolder ? "Folder" : row.name.includes(".") ? row.name.split(".").pop() ?? "" : "—"), cell: (row) => (row.isFolder ? "Folder" : row.name.includes(".") ? row.name.split(".").pop() : "—") },
    { key: "modified", header: "Last modified", minWidth: 140, sortValue: (row) => row.modified, cell: (row) => dash(row.modified) },
    { key: "size", header: "Size", minWidth: 100, sortValue: (row) => String(row.sizeBytes).padStart(15, "0"), cell: (row) => (row.isFolder ? "—" : formatBytes(row.sizeBytes)) },
    { key: "class", header: "Storage class", minWidth: 120, sortValue: (row) => row.storageClass, cell: (row) => dash(row.storageClass) },
  ];

  return (
    <Shell tree={storageNav}>
      <div className="min-h-0 flex-1 overflow-auto bg-[#f3f3f5]">
        <PageHeader
          crumbs={[{ label: "S3", href: "/storage/buckets" }, { label: "Buckets", href: "/storage/buckets" }, { label: name }]}
          info="Object keys and sizes are kept in this browser session. File contents are not stored."
          meta={api.mode === "sample" ? <SampleBadge /> : null}
        />
        <div className="mb-3 flex gap-4 px-4 text-[14px]">
          {(["objects", "properties"] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={cn("border-b-2 pb-2 capitalize", tab === item ? "border-[#006ce0] font-semibold text-[#006ce0]" : "border-transparent text-[#16191f]")}
              onClick={() => go({ tab: item })}
            >
              {item}
            </button>
          ))}
        </div>
        {tab === "objects" ? (
          <div className="mx-4 mb-6 rounded-lg border border-[#e6e8eb] bg-white p-3">
            <h2 className="text-[16px] font-semibold">Objects ({rows.length})</h2>
            <p className="mb-3 text-[13px] text-[#5f6b7a]">Objects are the fundamental entities stored in a bucket.</p>
            <nav aria-label="Object path" className="mb-3 flex flex-wrap items-center gap-1 text-[13px]">
              <button type="button" className="text-[#006ce0] hover:underline" onClick={() => go({})}>{name}</button>
              {segments.map((segment, index) => (
                <span key={segments.slice(0, index + 1).join("/")} className="flex items-center gap-1">
                  <span className="text-[#5f6b7a]">/</span>
                  {index === segments.length - 1 ? (
                    <span className="font-semibold">{segment}</span>
                  ) : (
                    <button type="button" className="text-[#006ce0] hover:underline" onClick={() => go({ prefix: `${segments.slice(0, index + 1).join("/")}/` })}>
                      {segment}
                    </button>
                  )}
                </span>
              ))}
            </nav>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <OutlineButton
                disabled={selectedRows.length === 0}
                onClick={() => void copyToClipboard(selectedRows.map((row) => `s3://${name}/${row.key}`).join("\n"), "bucket-detail-view")}
              >
                Copy S3 URI
              </OutlineButton>
              <OutlineButton
                disabled={selectedRows.length === 0}
                onClick={() => {
                  setConfirm("");
                  setDeleteOpen(true);
                }}
              >
                Delete
              </OutlineButton>
              <OutlineButton
                onClick={() => {
                  setFolderName("");
                  setFolderError(null);
                  setFolderOpen(true);
                }}
              >
                Create folder
              </OutlineButton>
              <Link href={uploadHref} className="inline-flex h-8 items-center rounded-lg bg-[#ff9900] px-3 text-[13px] font-semibold text-[#16191f] hover:bg-[#ec7211]">
                Upload
              </Link>
            </div>
            <ResourceTable
              className="px-0 pb-0"
              bodyClassName="min-h-[300px]"
              rows={rows}
              getId={(row) => row.key}
              columns={columns}
              selectedIds={selectedRows.map((row) => row.key)}
              onSelectedIds={setSelectedIds}
              emptyTitle="No objects"
              emptyMessage="You don't have any objects in this bucket."
              emptyAction={{ label: "Upload", href: uploadHref }}
              filterPlaceholder="Find objects by prefix"
              initialSort={{ key: "name", dir: "asc" }}
            />
          </div>
        ) : (
          <div className="mx-4 mb-6 rounded-lg border border-[#e6e8eb] bg-white p-4 text-[13px]">
            <h2 className="mb-3 text-[16px] font-semibold">Bucket overview</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div><dt className="text-[#5f6b7a]">Region</dt><dd>{bucket.region}</dd></div>
              <div><dt className="text-[#5f6b7a]">Creation date</dt><dd>{bucket.created}</dd></div>
              <div><dt className="text-[#5f6b7a]">Bucket type</dt><dd>{bucket.kind === "general" ? "General purpose" : "Directory"}</dd></div>
              <div><dt className="text-[#5f6b7a]">Bucket Versioning</dt><dd>{bucket.versioning ? "Enabled" : "Disabled"}</dd></div>
              <div><dt className="text-[#5f6b7a]">Block all public access</dt><dd>{bucket.blockPublicAccess ? "On" : "Off"}</dd></div>
            </dl>
          </div>
        )}
      </div>
      <PanelDialog
        open={folderOpen}
        title="Create folder"
        onClose={() => setFolderOpen(false)}
        footer={
          <>
            <OutlineButton onClick={() => setFolderOpen(false)}>Cancel</OutlineButton>
            <OrangeButton
              onClick={() => {
                if (!validFolderName(folderName)) {
                  setFolderError("Folder names cannot be empty or contain a slash.");
                  return;
                }
                api.createFolder(name, `${prefix}${folderName}/`);
                setFolderOpen(false);
              }}
            >
              Create folder
            </OrangeButton>
          </>
        }
      >
        <FieldLabel>Folder name</FieldLabel>
        <input className="field" value={folderName} onChange={(event) => setFolderName(event.target.value)} />
        {folderError ? <p className="mt-2 text-[#d13212]">{folderError}</p> : null}
      </PanelDialog>
      <PanelDialog
        open={deleteOpen}
        title="Delete objects"
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <OutlineButton onClick={() => setDeleteOpen(false)}>Cancel</OutlineButton>
            <OrangeButton
              disabled={confirm !== CONFIRM_WORD}
              onClick={() => {
                api.deleteObjects(name, selectedRows.map((row) => row.key));
                setSelectedIds([]);
                setDeleteOpen(false);
              }}
            >
              Delete objects
            </OrangeButton>
          </>
        }
      >
        <p className="mb-3">Deleting {selectedRows.length} selected item{selectedRows.length === 1 ? "" : "s"} cannot be undone. Folders are deleted with everything inside them.</p>
        <FieldLabel>To confirm, type “{CONFIRM_WORD}”.</FieldLabel>
        <input className="field" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
      </PanelDialog>
    </Shell>
  );
}
