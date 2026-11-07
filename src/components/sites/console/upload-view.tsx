"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { uploadObjectAction } from "@/app/actions/resources";
import type { AccountBucket, ApiError } from "@/lib/vws-api/adapter";
import { storageNav } from "@/lib/console-data";
import { formatBytes } from "@/lib/bucket-objects";
import { objectPageHref } from "@/lib/object-detail";
import {
  canStart,
  initialRun,
  runUpload,
  summarize,
  uploadReducer,
  type UploadItem,
  type UploadRun,
  type UploadSummary,
} from "@/lib/upload-run";
import { ApiErrorAlert } from "@/components/sites/console/api-action";
import { PageHeader } from "@/components/sites/console/page-header";
import { Shell } from "@/components/sites/console/shell";
import { OrangeButton, OutlineButton } from "@/components/sites/console/ui";

function sendItem(bucket: string, item: UploadItem): Promise<ApiError | null> {
  const body = new FormData();
  body.set("key", item.key);
  body.set("file", item.file);
  return uploadObjectAction(bucket, body);
}

function banner(phase: UploadRun["phase"], summary: UploadSummary): string {
  if (phase === "running") return "Upload in progress";
  if (phase === "done") return summary.failed > 0 ? "Upload failed" : "Upload succeeded";
  return "Some files are waiting to upload";
}

function StatusCell({ item }: { item: UploadItem }) {
  const { kind } = item.status;
  const color = kind === "succeeded" ? "text-[#037f0c]" : kind === "failed" ? "text-[#d91515]" : undefined;
  return <span className={color}>{STATUS_LABEL[kind]}</span>;
}

function ErrorCell({ item }: { item: UploadItem }) {
  if (item.status.kind !== "failed") return <span className="text-[#5f6b7a]">-</span>;
  const { error } = item.status;
  return (
    <div>
      <p className="text-[12px]">{error.message || "The VWS API returned an error."}</p>
      <p className="font-mono text-[12px] text-[#5f6b7a]">
        {error.code} · Request ID {error.requestId ?? "—"}
      </p>
    </div>
  );
}

const STATUS_LABEL: Record<UploadItem["status"]["kind"], string> = {
  pending: "Pending",
  uploading: "Uploading",
  succeeded: "Succeeded",
  failed: "Failed",
};

export function UploadView({
  name,
  bucket,
  loadError,
}: {
  name: string;
  bucket: AccountBucket | null;
  loadError: ApiError | null;
}) {
  const prefix = useSearchParams().get("prefix") ?? "";
  const [run, send] = useReducer(uploadReducer, initialRun);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const base = `/storage/buckets/${encodeURIComponent(name)}`;
  const back = prefix ? `${base}?prefix=${encodeURIComponent(prefix)}` : base;
  const summary = summarize(run.items);
  const attempted = run.phase === "running" || summary.succeeded + summary.failed > 0;

  const add = (list: FileList | null) => {
    if (list) send({ type: "add", files: Array.from(list), prefix });
  };

  const upload = () => {
    // The ref closes the gap before React re-renders; the reducer's phase covers everything after it.
    if (inFlight.current || !canStart(run)) return;
    inFlight.current = true;
    send({ type: "start" });
    void runUpload(
      run,
      send,
      (item) => sendItem(name, item),
      () => mounted.current,
    ).finally(() => {
      inFlight.current = false;
    });
  };

  const crumbs = [
    { label: "S3", href: "/storage/buckets" },
    { label: "Buckets", href: "/storage/buckets" },
    { label: name, href: base },
    { label: "Upload" },
  ];

  if (!bucket) {
    return (
      <Shell tree={storageNav}>
        <PageHeader crumbs={crumbs} />
        <ApiErrorAlert error={loadError} title="The bucket could not be loaded" />
        {loadError ? null : (
          <div className="px-4 py-6 text-[13px]">
            <p className="font-semibold">Bucket not found</p>
            <Link href="/storage/buckets" className="mt-3 inline-block text-[#006ce0] hover:underline">
              Back to buckets
            </Link>
          </div>
        )}
      </Shell>
    );
  }

  return (
    <Shell tree={storageNav}>
      <div className="min-h-0 flex-1 overflow-auto bg-[#f3f3f5]">
        <PageHeader
          crumbs={crumbs}
          info="Uploaded files are stored in the bucket. This console cannot list them afterward, and a reload clears this list."
        />
        <div className="mx-auto max-w-[900px] space-y-4 px-4 pb-8 text-[13px]">
          {attempted ? (
            <section className="rounded-lg border border-[#e6e8eb] bg-white p-4">
              <h2 className="mb-1 text-[16px] font-semibold">Upload: status</h2>
              <p role="status" className="mb-3 font-semibold">
                {banner(run.phase, summary)}
              </p>
              <dl className="grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-[#5f6b7a]">Succeeded</dt>
                  <dd>{summary.succeeded}</dd>
                </div>
                <div>
                  <dt className="text-[#5f6b7a]">Failed</dt>
                  <dd>{summary.failed}</dd>
                </div>
                <div>
                  <dt className="text-[#5f6b7a]">Waiting</dt>
                  <dd>{summary.pending + summary.uploading}</dd>
                </div>
              </dl>
            </section>
          ) : null}
          {run.skipped.length > 0 ? (
            <p role="status" className="rounded border border-[#8d6605] bg-[#fffce9] px-3 py-2">
              Skipped {run.skipped.length === 1 ? "a file" : `${run.skipped.length} files`} already in the list:{" "}
              {run.skipped.join(", ")}
            </p>
          ) : null}
          {run.phase === "done" ? null : (
            <section className="rounded-lg border border-[#e6e8eb] bg-white p-4">
              <p className="mb-3 text-[#5f6b7a]">
                Add the files you want to upload. Destination: s3://{name}/{prefix}
              </p>
              <div
                className={`grid place-items-center rounded-lg border-2 border-dashed px-4 py-10 text-center ${dragging ? "border-[#006ce0] bg-[#f2f8fd]" : "border-[#c6c9ce]"}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  add(event.dataTransfer.files);
                }}
              >
                <p>Drag and drop files here, or choose Add files.</p>
                <OutlineButton className="mt-3" onClick={() => input.current?.click()}>
                  Add files
                </OutlineButton>
                <input
                  ref={input}
                  type="file"
                  multiple
                  className="hidden"
                  aria-label="Add files"
                  onChange={(event) => {
                    add(event.target.files);
                    event.target.value = "";
                  }}
                />
              </div>
            </section>
          )}
          <section className="rounded-lg border border-[#e6e8eb] bg-white p-4">
            <h2 className="mb-2 text-[16px] font-semibold">Files and folders ({run.items.length})</h2>
            {run.items.length === 0 ? (
              <p className="text-[#5f6b7a]">No files or folders</p>
            ) : (
              <table className="w-full text-left">
                <thead className="text-[#5f6b7a]">
                  <tr>
                    <th className="py-1">Name</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Status</th>
                    <th>Error</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {run.items.map((item) => (
                    <tr key={item.key} className="border-t border-[#e6e8eb] align-top">
                      <td className="break-all py-1.5">
                        {item.status.kind === "succeeded" ? (
                          <Link href={objectPageHref(bucket.name, item.key)} className="text-[#006ce0] hover:underline">
                            {item.file.name}
                          </Link>
                        ) : (
                          item.file.name
                        )}
                      </td>
                      <td>{item.file.type || "—"}</td>
                      <td>{formatBytes(item.file.size)}</td>
                      <td>
                        <StatusCell item={item} />
                      </td>
                      <td>
                        <ErrorCell item={item} />
                      </td>
                      <td className="text-right">
                        {item.status.kind === "succeeded" ? null : (
                          <button
                            type="button"
                            className="text-[#006ce0] hover:underline disabled:cursor-not-allowed disabled:text-[#8d9aa8] disabled:no-underline"
                            disabled={run.phase === "running"}
                            aria-label={`Remove ${item.file.name}`}
                            onClick={() => send({ type: "remove", key: item.key })}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <div className="flex justify-end gap-2">
            <Link href={back}>
              <OutlineButton type="button">{attempted ? "Close" : "Cancel"}</OutlineButton>
            </Link>
            <OrangeButton disabled={!canStart(run)} onClick={upload}>
              {run.phase === "done" ? "Retry" : "Upload"}
            </OrangeButton>
          </div>
        </div>
      </div>
    </Shell>
  );
}
