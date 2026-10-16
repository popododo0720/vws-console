"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { AccountBucket, ApiError } from "@/lib/vws-api/adapter";
import { formatBucketCreationDate } from "@/lib/bucket-display";
import { storageNav } from "@/lib/console-data";
import { ApiErrorAlert } from "@/components/sites/console/api-action";
import { PageHeader } from "@/components/sites/console/page-header";
import { Shell } from "@/components/sites/console/shell";
import { OutlineButton } from "@/components/sites/console/ui";
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
          info="Objects in this bucket cannot be listed from this console."
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
          <div className="mx-4 mb-6 rounded-lg border border-[#e6e8eb] bg-white p-3 text-[13px]">
            <h2 className="text-[16px] font-semibold">Objects</h2>
            <p className="my-3 text-[#5f6b7a]">This console cannot list objects in this bucket.</p>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <OutlineButton disabled>Copy S3 URI</OutlineButton>
              <OutlineButton disabled>Delete</OutlineButton>
              <OutlineButton disabled>Create folder</OutlineButton>
              <Link
                href={uploadHref}
                className="inline-flex h-8 items-center rounded-lg bg-[#ff9900] px-3 text-[13px] font-semibold text-[#16191f] hover:bg-[#ec7211]"
              >
                Upload
              </Link>
            </div>
            <p className="text-[#5f6b7a]">
              Creating folders and deleting objects need an object list, which this console does not have.
            </p>
          </div>
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
