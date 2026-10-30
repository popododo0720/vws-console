"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  const router = useRouter();
  const prefix = useSearchParams().get("prefix") ?? "";
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const uploadInFlight = useRef(false);
  const addedDuringUpload = useRef(false);
  const base = `/storage/buckets/${encodeURIComponent(name)}`;
  const back = prefix ? `${base}?prefix=${encodeURIComponent(prefix)}` : base;

  const add = (list: FileList | null) => {
    if (!list) return;
    if (uploadInFlight.current) addedDuringUpload.current = true;
    setFiles((prev) => {
      const seen = new Set(prev.map((file) => file.name));
      return [...prev, ...Array.from(list).filter((file) => !seen.has(file.name))];
    });
  };

  const upload = async () => {
    const chosen = [...files];
    if (chosen.length === 0) return;
    uploadInFlight.current = true;
    addedDuringUpload.current = false;
    setError(null);
    setUploading(true);
    let failure: ApiError | null = null;
    const kept: File[] = [];
    for (let index = 0; index < chosen.length; index += 1) {
      const file = chosen[index];
      if (file.size > MAX_OBJECT_BYTES) {
        failure = {
          code: "InvalidArgument",
          message: "Objects larger than 4 MiB cannot be uploaded.",
          requestId: null,
        };
        kept.push(...chosen.slice(index));
        break;
      }
      const body = new FormData();
      body.set("key", `${prefix}${file.name}`);
      body.set("file", file);
      let result: ApiError | null;
      try {
        result = await uploadObjectAction(name, body);
      } catch {
        result = { code: "ServiceUnavailable", message: "The upload could not be sent.", requestId: null };
      }
      if (result) {
        failure = result;
        kept.push(...chosen.slice(index));
        break;
      }
    }
    setFiles((current) => current.filter((file) => !chosen.includes(file) || kept.includes(file)));
    uploadInFlight.current = false;
    setUploading(false);
    setError(failure);
    if (!failure && !addedDuringUpload.current) router.push(back);
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
          info="Uploaded files are stored in the bucket. This console cannot list them afterward."
        />
        <ApiErrorAlert error={error} title="Upload failed" />
        <div className="mx-auto max-w-[900px] space-y-4 px-4 pb-8 text-[13px]">
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
            <OrangeButton disabled={files.length === 0 || uploading} onClick={() => void upload()}>
              Upload
            </OrangeButton>
          </div>
        </div>
      </div>
    </Shell>
  );
}
