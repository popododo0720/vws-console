"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { deleteObjectAction, getObjectAction } from "@/app/actions/resources";
import type { AccountBucket, ApiError, BucketName, ObjectContent } from "@/lib/vws-api/adapter";
import { copyToClipboard } from "@/lib/clipboard";
import { formatBucketCreationDate } from "@/lib/bucket-display";
import { storageNav } from "@/lib/console-data";
import { ApiErrorAlert } from "@/components/sites/console/api-action";
import { PageHeader } from "@/components/sites/console/page-header";
import { Shell } from "@/components/sites/console/shell";
import { FieldLabel, OrangeButton, OutlineButton, PanelDialog } from "@/components/sites/console/ui";
import { cn } from "@/lib/utils";

export function BucketDetailView({
  name,
  bucket,
  loadError,
}: {
  name: string;
  bucket: AccountBucket | null;
  loadError: ApiError | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const urlTab = params.get("tab") === "properties" ? "properties" : "objects";
  const [tab, setTab] = useState(urlTab);
  const [seenUrlTab, setSeenUrlTab] = useState(urlTab);
  if (urlTab !== seenUrlTab) {
    setSeenUrlTab(urlTab);
    setTab(urlTab);
  }
  const base = `/storage/buckets/${encodeURIComponent(name)}`;
  const go = (next: { tab?: string }) => {
    const value = next.tab === "properties" ? "properties" : "objects";
    setTab(value);
    const query = new URLSearchParams();
    if (value === "properties") query.set("tab", "properties");
    const search = query.toString();
    router.replace(search ? `${base}?${search}` : base);
  };

  if (!bucket) {
    return (
      <Shell tree={storageNav}>
        <PageHeader
          crumbs={[
            { label: "S3", href: "/storage/buckets" },
            { label: "Buckets", href: "/storage/buckets" },
            { label: name },
          ]}
        />
        <ApiErrorAlert error={loadError} title="The bucket could not be loaded" />
        {loadError ? null : (
          <div className="px-4 py-6 text-[13px]">
            <p className="font-semibold">Bucket not found</p>
            <p className="mt-1 text-[#5f6b7a]">{name} is not in this account.</p>
            <Link href="/storage/buckets" className="mt-3 inline-block text-[#006ce0] hover:underline">
              Back to buckets
            </Link>
          </div>
        )}
      </Shell>
    );
  }

  const uploadHref = `${base}/upload`;

  return (
    <Shell tree={storageNav}>
      <div className="min-h-0 flex-1 overflow-auto bg-[#f3f3f5]">
        <PageHeader
          crumbs={[
            { label: "S3", href: "/storage/buckets" },
            { label: "Buckets", href: "/storage/buckets" },
            { label: name },
          ]}
          info="Objects in this bucket cannot be listed from this console. Find one by its key."
        />
        <div className="mb-3 flex gap-4 px-4 text-[14px]">
          {(["objects", "properties"] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={cn(
                "border-b-2 pb-2 capitalize",
                tab === item ? "border-[#006ce0] font-semibold text-[#006ce0]" : "border-transparent text-[#16191f]",
              )}
              onClick={() => go({ tab: item })}
            >
              {item}
            </button>
          ))}
        </div>
        {tab === "objects" ? (
          <ObjectsPanel bucket={bucket.name} uploadHref={uploadHref} />
        ) : (
          <div className="mx-4 mb-6 rounded-lg border border-[#e6e8eb] bg-white p-4 text-[13px]">
            <h2 className="mb-3 text-[16px] font-semibold">Bucket overview</h2>
            <p className="mb-3 text-[#5f6b7a]">
              Region, bucket type, versioning, and Block Public Access are not returned for this bucket.
            </p>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-[#5f6b7a]">Region</dt>
                <dd>—</dd>
              </div>
              <div>
                <dt className="text-[#5f6b7a]">Creation date</dt>
                <dd>{formatBucketCreationDate(bucket.created)}</dd>
              </div>
              <div>
                <dt className="text-[#5f6b7a]">Bucket type</dt>
                <dd>—</dd>
              </div>
              <div>
                <dt className="text-[#5f6b7a]">Bucket Versioning</dt>
                <dd>—</dd>
              </div>
              <div>
                <dt className="text-[#5f6b7a]">Block all public access</dt>
                <dd>—</dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </Shell>
  );
}

const DELETE_WORD = "permanently delete";

function objectType(key: string): string {
  const name = key.split("/").pop() ?? key;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1) : "—";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(1)} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

function saveFile(object: ObjectContent) {
  const copy = new Uint8Array(object.bytes.byteLength);
  copy.set(object.bytes);
  const url = URL.createObjectURL(new Blob([copy], { type: object.contentType || "application/octet-stream" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = object.key.split("/").pop() || object.key;
  link.click();
  URL.revokeObjectURL(url);
}

function ObjectsPanel({ bucket, uploadHref }: { bucket: BucketName; uploadHref: string }) {
  const [query, setQuery] = useState("");
  const [object, setObject] = useState<ObjectContent | null>(null);
  const [searched, setSearched] = useState<string | null>(null);
  const [selected, setSelected] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();

  const find = (event: FormEvent) => {
    event.preventDefault();
    const key = query;
    if (!key) return;
    startTransition(async () => {
      const result = await getObjectAction(bucket, key);
      setSelected(false);
      setNotice(null);
      if (!result.ok) {
        setError(result.error);
        setObject(null);
        setSearched(null);
        return;
      }
      setError(null);
      setObject(result.value);
      setSearched(key);
    });
  };

  const remove = () => {
    if (!object) return;
    const key = object.key;
    startTransition(async () => {
      const failure = await deleteObjectAction(bucket, key);
      if (failure) {
        setError(failure);
        setConfirm("");
        return;
      }
      setError(null);
      setObject(null);
      setSelected(false);
      setDialog(false);
      setNotice(`Successfully deleted ${key}.`);
    });
  };

  const rows = object ? [object] : [];

  return (
    <div className="mx-4 mb-6 rounded-lg border border-[#e6e8eb] bg-white p-3 text-[13px]">
      <ApiErrorAlert error={error} title="The object action failed" />
      {notice ? (
        <p role="status" className="mb-3 rounded border border-[#037f0c] bg-[#f2fcf3] px-3 py-2 text-[#037f0c]">
          {notice}
        </p>
      ) : null}
      <h2 className="text-[16px] font-semibold">
        Objects <span className="font-normal text-[#5f6b7a]">({rows.length})</span>
      </h2>
      <p className="my-3 text-[#5f6b7a]">This console cannot list objects in this bucket. Find an object by its key.</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <OutlineButton
          disabled={!selected || !object}
          onClick={() => object && void copyToClipboard(`s3://${bucket}/${object.key}`, "bucket-objects")}
        >
          Copy S3 URI
        </OutlineButton>
        <OutlineButton disabled={!selected || !object} onClick={() => object && saveFile(object)}>
          Download
        </OutlineButton>
        <OutlineButton
          disabled={!selected || !object}
          onClick={() => {
            setConfirm("");
            setDialog(true);
          }}
        >
          Delete
        </OutlineButton>
        <OutlineButton disabled>Create folder</OutlineButton>
        <Link
          href={uploadHref}
          className="inline-flex h-8 items-center rounded-lg bg-[#ff9900] px-3 text-[13px] font-semibold text-[#16191f] hover:bg-[#ec7211]"
        >
          Upload
        </Link>
      </div>
      <form className="mb-3" role="search" onSubmit={find}>
        <input
          type="search"
          className="field w-full max-w-md"
          aria-label="Find objects by key"
          placeholder="Find objects by key"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </form>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-[#e6e8eb] text-[#5f6b7a]">
            <th className="w-8 py-2" />
            <th className="py-2 font-semibold">Name</th>
            <th className="py-2 font-semibold">Type</th>
            <th className="py-2 font-semibold">Last modified</th>
            <th className="py-2 font-semibold">Size</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-[#e6e8eb]">
              <td className="py-2">
                <input
                  type="checkbox"
                  aria-label={`Select ${row.key}`}
                  checked={selected}
                  onChange={(event) => setSelected(event.target.checked)}
                />
              </td>
              <td className="py-2 text-[#006ce0]">{row.key}</td>
              <td className="py-2">{objectType(row.key)}</td>
              <td className="py-2">{row.lastModified ? formatBucketCreationDate(row.lastModified) : "—"}</td>
              <td className="py-2">{formatSize(row.size)}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-6 text-center">
                <p className="font-semibold">No objects</p>
                <p className="text-[#5f6b7a]">
                  {searched !== null
                    ? `No object has the key ${searched}.`
                    : pending
                      ? "Loading object"
                      : "Enter an object key to find it."}
                </p>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <PanelDialog
        open={dialog}
        title="Delete objects"
        onClose={() => setDialog(false)}
        footer={
          <>
            <OutlineButton onClick={() => setDialog(false)}>Cancel</OutlineButton>
            <OrangeButton disabled={confirm !== DELETE_WORD || pending} onClick={remove}>
              Delete objects
            </OrangeButton>
          </>
        }
      >
        <p className="mb-3">Deleting the specified objects can&apos;t be undone.</p>
        {object ? <p className="mb-3 font-semibold">{object.key}</p> : null}
        {error ? <p className="mb-3 text-[#d13212]">{error.message}</p> : null}
        <FieldLabel>To confirm deletion, type “{DELETE_WORD}” in the text input field.</FieldLabel>
        <input
          className="field"
          aria-label="Confirm deletion"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </PanelDialog>
    </div>
  );
}
