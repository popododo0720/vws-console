"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBucketAction } from "@/app/actions/resources";
import { storageNav } from "@/lib/console-data";
import { useApiAction } from "@/components/sites/console/api-action";
import { PageHeader } from "@/components/sites/console/page-header";
import { Shell } from "@/components/sites/console/shell";
import { FieldLabel, OrangeButton, OutlineButton } from "@/components/sites/console/ui";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[#e6e8eb] bg-white">
      <h2 className="border-b border-[#e6e8eb] px-4 py-3 text-[16px] font-semibold">{title}</h2>
      <div className="space-y-4 px-4 py-4 text-[13px]">{children}</div>
    </section>
  );
}

export function CreateBucketView() {
  const router = useRouter();
  const action = useApiAction();
  const [name, setName] = useState("");

  const submit = () => {
    action.run(
      () => createBucketAction(name),
      () => router.push(`/storage/buckets/${encodeURIComponent(name.trim())}`),
    );
  };

  const error = action.error?.message ?? null;

  return (
    <Shell tree={storageNav}>
      <div className="min-h-0 flex-1 overflow-auto bg-[#f3f3f5]">
        <PageHeader
          crumbs={[
            { label: "S3", href: "/storage/buckets" },
            { label: "Buckets", href: "/storage/buckets" },
            { label: "Create bucket" },
          ]}
          info="Buckets are containers for objects."
        />
        <div className="mx-auto max-w-[900px] space-y-4 px-4 pb-8">
          <Section title="General configuration">
            <div>
              <FieldLabel>Region</FieldLabel>
              <p className="text-[#5f6b7a]">
                The API does not accept a region. The bucket list shows a dash until it does.
              </p>
            </div>
            <div className="space-y-2">
              <FieldLabel>Bucket type</FieldLabel>
              <label className="flex items-start gap-2 rounded-md border border-[#e6e8eb] p-3">
                <input type="radio" name="kind" checked disabled onChange={() => undefined} className="mt-0.5" />
                <span>
                  <span className="block font-semibold">General purpose</span>
                  <span className="text-[#5f6b7a]">Recommended for most use cases and access patterns.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-md border border-[#e6e8eb] p-3">
                <input type="radio" name="kind" disabled className="mt-0.5" />
                <span>
                  <span className="block font-semibold">Directory</span>
                  <span className="text-[#5f6b7a]">Directory buckets are not available.</span>
                </span>
              </label>
            </div>
            <div>
              <FieldLabel>Bucket name</FieldLabel>
              <input
                className="field"
                placeholder="my-bucket"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <p className="mt-1 text-[12px] text-[#5f6b7a]">
                Bucket names must be 3–63 characters, unique in this account, and use only lowercase letters, numbers,
                and hyphens. Names cannot start with xn--, sthree-, or amzn-s3-demo-, or end with -s3alias, --ol-s3,
                --x-s3, or --table-s3.
              </p>
              {error ? (
                <p role="alert" className="mt-1 text-[#d13212]">
                  {error}
                </p>
              ) : null}
            </div>
          </Section>
          <Section title="Block Public Access settings for this bucket">
            <label className="flex items-start gap-2">
              <input type="checkbox" disabled className="mt-0.5" />
              <span>
                <span className="block font-semibold">Block all public access</span>
                <span className="text-[#5f6b7a]">
                  Block Public Access is not available. Creating a bucket does not apply it.
                </span>
              </span>
            </label>
          </Section>
          <Section title="Bucket Versioning">
            <div className="space-y-2">
              {["Disable", "Enable"].map((label) => (
                <label key={label} className="flex items-center gap-2">
                  <input type="radio" name="versioning" disabled />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-[#5f6b7a]">Bucket versioning is not available. Creating a bucket does not enable it.</p>
          </Section>
          <div className="flex justify-end gap-2">
            <Link href="/storage/buckets">
              <OutlineButton type="button">Cancel</OutlineButton>
            </Link>
            <OrangeButton onClick={submit}>Create bucket</OrangeButton>
          </div>
        </div>
      </div>
    </Shell>
  );
}
