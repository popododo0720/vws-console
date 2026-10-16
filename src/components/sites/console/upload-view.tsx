"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { uploadObjectAction } from "@/app/actions/resources";
import type { AccountBucket, ApiError } from "@/lib/vws-api/adapter";
import { MAX_OBJECT_BYTES } from "@/lib/object-upload";
import { storageNav } from "@/lib/console-data";
import { formatBytes } from "@/lib/bucket-objects";
import { ApiErrorAlert } from "@/components/sites/console/api-action";
import { PageHeader } from "@/components/sites/console/page-header";
import { Shell } from "@/components/sites/console/shell";
import { OrangeButton, OutlineButton } from "@/components/sites/console/ui";

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
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const base = `/storage/buckets/${encodeURIComponent(name)}`;
  const back = prefix ? `${base}?prefix=${encodeURIComponent(prefix)}` : base;

  const add = (list: FileList | null) => {
    if (!list) return;
    setNotice(null);
    setFiles((prev) => {
      const seen = new Set(prev.map((file) => file.name));
      return [...prev, ...Array.from(list).filter((file) => !seen.has(file.name))];
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

  const upload = () => {
    const chosen = [...files];
    startTransition(async () => {
      const stored: string[] = [];
      const remaining: File[] = [];
      let failed = false;
      for (const file of chosen) {
        if (failed) {
          remaining.push(file);
          continue;
        }
        if (file.size > MAX_OBJECT_BYTES) {
          setError({
            code: "InvalidArgument",
            message: "Objects larger than 4 MiB cannot be uploaded.",
            requestId: null,
          });
          remaining.push(file);
          failed = true;
          continue;
        }
        const body = new FormData();
        const key = `${prefix}${file.name}`;
        body.set("key", key);
        body.set("file", file);
        const failure = await uploadObjectAction(name, body);
        if (failure) {
          setError(failure);
          remaining.push(file);
          failed = true;
          continue;
        }
        stored.push(key);
      }
      setFiles(remaining);
      setNotice(stored.length > 0 ? `Stored ${stored.join(", ")}. This console cannot list objects.` : null);
      if (!failed) setError(null);
    });
  };

  return (
    <Shell tree={storageNav}>
      <div className="min-h-0 flex-1 overflow-auto bg-[#f3f3f5]">
        <PageHeader
          crumbs={crumbs}
          info="Uploaded files are stored in the bucket. This console cannot list them afterward."
        />
        <ApiErrorAlert error={error} title="The upload failed" />
        <div className="mx-auto max-w-[900px] space-y-4 px-4 pb-8 text-[13px]">
          {notice ? <p className="rounded-lg border border-[#e6e8eb] bg-white px-4 py-3">{notice}</p> : null}
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
          <section className="rounded-lg border border-[#e6e8eb] bg-white p-4">
            <h2 className="mb-2 text-[16px] font-semibold">Files and folders ({files.length})</h2>
            {files.length === 0 ? (
              <p className="text-[#5f6b7a]">No files or folders</p>
            ) : (
              <table className="w-full text-left">
                <thead className="text-[#5f6b7a]">
                  <tr>
                    <th className="py-1">Name</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {files.map((file) => (
                    <tr key={file.name} className="border-t border-[#e6e8eb]">
                      <td className="py-1.5">{file.name}</td>
                      <td>{file.type || "—"}</td>
                      <td>{formatBytes(file.size)}</td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="text-[#006ce0] hover:underline"
                          onClick={() => setFiles((prev) => prev.filter((item) => item !== file))}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <div className="flex justify-end gap-2">
            <Link href={back}>
              <OutlineButton type="button">Cancel</OutlineButton>
            </Link>
            <OrangeButton disabled={files.length === 0 || pending} onClick={upload}>
              Upload
            </OrangeButton>
          </div>
        </div>
      </div>
    </Shell>
  );
}
