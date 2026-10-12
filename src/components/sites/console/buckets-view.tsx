"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Bucket } from "@/types/console";
import { storageNav } from "@/lib/console-data";
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

export function BucketsView() {
  const api = useConsole();
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("tab") === "directory" ? "directory" : "general";
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [action, setAction] = useState<"empty" | "delete" | null>(null);
  const [confirm, setConfirm] = useState("");
  const [blockedNames, setBlockedNames] = useState<string[]>([]);
  const [dash, setDash] = useState(false);
  const rows = useMemo(() => api.buckets.filter((item) => item.kind === tab), [api.buckets, tab]);
  const selected = rows.filter((item) => selectedIds.includes(item.name));
  const generalCount = api.buckets.filter((item) => item.kind === "general").length;
  const directoryCount = api.buckets.filter((item) => item.kind === "directory").length;

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
    setBlockedNames([]);
    setAction(next);
  };
  const confirmWord = action === "empty" ? "permanently delete" : selected.length === 1 ? selected[0].name : "delete";

  const columns: Column<Bucket>[] = [
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
    { key: "region", header: "Region", minWidth: 160, sortValue: (row) => row.region, cell: (row) => row.region },
    { key: "created", header: "Creation date", minWidth: 140, sortValue: (row) => row.created, cell: (row) => row.created },
  ];

  return (
    <Shell tree={storageNav}>
      <div className="min-h-0 flex-1 overflow-auto bg-[#f3f3f5]">
        <div className="flex flex-col gap-4 p-4 xl:flex-row">
          <div className="min-w-0 flex-1">
            <PageHeader
              mark="B"
              crumbs={[{ label: "S3", href: "/storage/buckets" }, { label: "Buckets" }]}
              info="Buckets hold objects. This list is stored only in the browser session."
            />
            <div className="mb-3 flex gap-4 px-4 text-[14px]">
              <button
                type="button"
                className={cn("border-b-2 pb-2", tab === "general" ? "border-[#006ce0] font-semibold text-[#006ce0]" : "border-transparent text-[#16191f]")}
                onClick={() => setTab("general")}
              >
                General purpose buckets ({generalCount})
              </button>
              <button
                type="button"
                className={cn("border-b-2 pb-2", tab === "directory" ? "border-[#006ce0] font-semibold text-[#006ce0]" : "border-transparent text-[#16191f]")}
                onClick={() => setTab("directory")}
              >
                Directory buckets ({directoryCount})
              </button>
              <InfoTip text="General purpose buckets are the default. Directory buckets are a separate list in this preview." />
            </div>
            <div className="mx-4 rounded-lg border border-[#e6e8eb] bg-white p-3">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <OutlineButton
                  disabled={selected.length === 0}
                  onClick={() => void navigator.clipboard.writeText(selected.map((item) => item.name).join("\n"))}
                >
                  Copy name
                </OutlineButton>
                <OutlineButton
                  disabled={selected.length === 0}
                  onClick={() => openAction("empty")}
                >
                  Empty
                </OutlineButton>
                <OutlineButton
                  disabled={selected.length === 0}
                  onClick={() => openAction("delete")}
                >
                  Delete
                </OutlineButton>
                <Link href="/storage/buckets/create" className={cn(orangeLinkClass, "ml-auto")}>
                  Create bucket
                </Link>
              </div>
              <ResourceTable
                className="px-0 pb-0"
                bodyClassName="min-h-[420px]"
                rows={rows}
                getId={(row) => row.name}
                columns={columns}
                selectedIds={selected.map((item) => item.name)}
                onSelectedIds={setSelectedIds}
                emptyTitle="No buckets"
                emptyMessage={tab === "general" ? "You don't have any buckets." : "You don't have any directory buckets."}
                emptyAction={{ label: "Create bucket", href: "/storage/buckets/create" }}
                filterPlaceholder="Find buckets by name"
                initialSort={{ key: "name", dir: "asc" }}
              />
            </div>
          </div>
          <aside className="w-full shrink-0 space-y-4 xl:w-[300px]">
            <section className="rounded-lg border border-[#e6e8eb] bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">Account snapshot</h2>
                <InfoTip text="Counts come from the records currently loaded in this session." />
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="rounded bg-[#f2f3f3] px-2 py-0.5 text-[11px] text-[#5f6b7a]">Updated daily</span>
                <OutlineButton onClick={() => setDash((value) => !value)}>View dashboard</OutlineButton>
              </div>
              {dash ? (
                <dl className="mt-3 space-y-1 text-[13px]">
                  <div className="flex justify-between"><dt>Buckets</dt><dd>{api.buckets.length}</dd></div>
                  <div className="flex justify-between"><dt>Instances in region</dt><dd>{api.instances.length}</dd></div>
                  <div className="flex justify-between"><dt>Volumes in region</dt><dd>{api.volumes.length}</dd></div>
                  <div className="flex justify-between"><dt>VPCs in region</dt><dd>{api.vpcs.length}</dd></div>
                </dl>
              ) : null}
            </section>
            <section className="rounded-lg border border-[#e6e8eb] bg-white p-4">
              <h2 className="font-semibold">External access summary</h2>
              <span className="mt-3 inline-block rounded bg-[#f2f3f3] px-2 py-0.5 text-[11px] text-[#5f6b7a]">Updated daily</span>
              <p className="mt-3 text-[13px] text-[#5f6b7a]">
                Findings in this preview list buckets whose policy would allow access from outside the account. None are recorded.
              </p>
            </section>
          </aside>
        </div>
      </div>
      <PanelDialog
        open={action !== null}
        title={action === "empty" ? "Empty bucket" : "Delete bucket"}
        onClose={() => setAction(null)}
        footer={
          <>
            <OutlineButton onClick={() => setAction(null)}>Cancel</OutlineButton>
            <OrangeButton
              disabled={confirm !== confirmWord}
              onClick={() => {
                if (action === "empty") selected.forEach((item) => api.emptyBucket(item.name));
                else {
                  const blocked = selected.filter((item) => api.objects.some((object) => object.bucket === item.name));
                  if (blocked.length > 0) {
                    setConfirm("");
                    setBlockedNames(blocked.map((item) => item.name));
                    return;
                  }
                  api.deleteBuckets(selected.map((item) => item.name));
                  setSelectedIds([]);
                }
                setAction(null);
              }}
            >
              {action === "empty" ? "Empty" : "Delete bucket"}
            </OrangeButton>
          </>
        }
      >
        <p className="mb-3">
          {action === "empty"
            ? "Emptying permanently deletes all objects in the selected bucket. This action cannot be undone."
            : "Deleting a bucket cannot be undone. A bucket must be empty before it can be deleted."}
        </p>
        {blockedNames.length > 0 ? (
          <p className="mb-3 text-[#d13212]">Not empty: {blockedNames.join(", ")}. Empty the bucket first.</p>
        ) : null}
        <FieldLabel>To confirm, type “{confirmWord}”.</FieldLabel>
        <input className="field" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
      </PanelDialog>
    </Shell>
  );
}
