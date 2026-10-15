"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { storageNav } from "@/lib/console-data";
import { formatBytes } from "@/lib/bucket-objects";
import { useConsole } from "@/components/sites/console/console-provider";
import { PageHeader } from "@/components/sites/console/page-header";
import { Shell } from "@/components/sites/console/shell";
import { OrangeButton, OutlineButton, SampleBadge } from "@/components/sites/console/ui";

export function UploadView({ name }: { name: string }) {
  const api = useConsole();
  const router = useRouter();
  const prefix = useSearchParams().get("prefix") ?? "";
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const bucket = api.buckets.find((item) => item.name === name);
  const base = `/storage/buckets/${encodeURIComponent(name)}`;
  const back = prefix ? `${base}?prefix=${encodeURIComponent(prefix)}` : base;

  const add = (list: FileList | null) => {
    if (!list) return;
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
        <div className="px-4 py-6 text-[13px]">
          <p className="font-semibold">Bucket not found</p>
          <Link href="/storage/buckets" className="mt-3 inline-block text-[#006ce0] hover:underline">
            Back to buckets
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell tree={storageNav}>
      <div className="min-h-0 flex-1 overflow-auto bg-[#f3f3f5]">
        <PageHeader
          crumbs={crumbs}
          info="Only file names and sizes are recorded here. File contents are not stored."
          meta={api.mode === "sample" ? <SampleBadge /> : null}
        />
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
            <OrangeButton
              disabled={files.length === 0}
              onClick={() => {
                api.addObjects(
                  name,
                  files.map((file) => ({ key: `${prefix}${file.name}`, sizeBytes: file.size })),
                );
                router.push(back);
              }}
            >
              Upload
            </OrangeButton>
          </div>
        </div>
      </div>
    </Shell>
  );
}
