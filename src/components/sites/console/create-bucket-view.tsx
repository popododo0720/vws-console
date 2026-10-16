"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBucketAction } from "@/app/actions/resources";
import { storageNav } from "@/lib/console-data";
import type { BucketKind } from "@/types/console";
import { useApiAction } from "@/components/sites/console/api-action";
import { useConsole } from "@/components/sites/console/console-provider";
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
  const api = useConsole();
  const router = useRouter();
  const action = useApiAction();
  const [kind, setKind] = useState<BucketKind>("general");
  const [name, setName] = useState("");
  const [versioning, setVersioning] = useState(false);
  const [blockPublic, setBlockPublic] = useState(true);
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  const submit = () => {
    if (kind === "directory") {
      setDirectoryError("Directory buckets are not available.");
      return;
    }
    setDirectoryError(null);
    action.run(
      () => createBucketAction(name),
      () => router.push("/storage/buckets"),
    );
  };

  const error = directoryError ?? action.error?.message ?? null;

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
              <p>{api.region}</p>
            </div>
            <div className="space-y-2">
              <FieldLabel>Bucket type</FieldLabel>
              {(
                [
                  ["general", "General purpose", "Recommended for most use cases and access patterns."],
                  ["directory", "Directory", "Recommended for low-latency use cases."],
                ] as const
              ).map(([value, label, hint]) => (
                <label key={value} className="flex items-start gap-2 rounded-md border border-[#e6e8eb] p-3">
                  <input
                    type="radio"
                    name="kind"
                    checked={kind === value}
                    onChange={() => setKind(value)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-semibold">{label}</span>
                    <span className="text-[#5f6b7a]">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <div>
              <FieldLabel>Bucket name</FieldLabel>
              <input
                className="field"
                placeholder="my-bucket"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setDirectoryError(null);
                }}
              />
              <p className="mt-1 text-[12px] text-[#5f6b7a]">
                Bucket names must be 3–63 characters, unique in this account, and use only lowercase letters, numbers,
                and hyphens.
              </p>
              {error ? <p className="mt-1 text-[#d13212]">{error}</p> : null}
            </div>
          </Section>
          <Section title="Block Public Access settings for this bucket">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={blockPublic}
                onChange={(event) => setBlockPublic(event.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="block font-semibold">Block all public access</span>
                <span className="text-[#5f6b7a]">
                  Turning this setting on is the same as turning on all four settings below.
                </span>
              </span>
            </label>
          </Section>
          <Section title="Bucket Versioning">
            <div className="space-y-2">
              {(
                [
                  [false, "Disable"],
                  [true, "Enable"],
                ] as const
              ).map(([value, label]) => (
                <label key={label} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="versioning"
                    checked={versioning === value}
                    onChange={() => setVersioning(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
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
